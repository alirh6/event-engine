import type { Env } from '../config/env.config.js';
import { PrismaConnection } from '../database/prisma.connection.js';
import { PrismaDeadLetterStore } from '../database/repositories/prisma-dead-letter.store.js';
import { PrismaEventRecordRepository } from '../database/repositories/prisma-event-record.repository.js';
import { PinoLoggerAdapter, createLogger, type PinoLogger } from '../logger/pino.logger.js';
import { EngineMetrics } from '../metrics/engine.metrics.js';
import { RedisConnection } from '../redis/redis.connection.js';
import { RedisStreamConsumer } from '../redis/redis-stream.consumer.js';
import { RedisStreamPublisher } from '../redis/redis-stream.publisher.js';
import { StreamEventProcessor } from '../../application/processing/stream-event.processor.js';
import { GetEventByIdHandler } from '../../application/queries/get-event-by-id.handler.js';
import { ListEventsHandler } from '../../application/queries/list-events.handler.js';
import { ListDeadLettersHandler } from '../../application/queries/list-dead-letters.handler.js';
import { IngestEventHandler } from '../../application/commands/ingest-event.handler.js';
import { ReplayDeadLetterHandler } from '../../application/commands/replay-dead-letter.handler.js';
import { EventController } from '../../interfaces/http/controllers/event.controller.js';
import type { LoggerPort } from '../../application/ports/logger.port.js';
import { withTimeout } from '../../shared/with-timeout.js';

/**
 * Composition root. The only place in the codebase where concrete
 * implementations are bound to their ports.
 */
export interface Container {
  readonly env: Env;
  readonly logger: LoggerPort;
  readonly baseLogger: PinoLogger;
  readonly metrics: EngineMetrics;
  readonly prismaConnection: PrismaConnection;
  readonly redisConnection: RedisConnection;
  readonly eventConsumer: RedisStreamConsumer;
  readonly eventController: EventController;
  readonly readiness: {
    readonly checkDatabase: () => Promise<void>;
    readonly checkRedis: () => Promise<void>;
  };
  readonly metricsEndpoint: {
    readonly read: () => Promise<string>;
    readonly contentType: string;
  };
}

const READY_CHECK_TIMEOUT_MS = 2_000;

/**
 * Compiles the optional fault-injection regex for DLQ verification. An
 * invalid pattern must fail the boot, not surface at 3am on a bad entry.
 */
function compileFailurePattern(pattern: string | undefined): RegExp | null {
  if (pattern === undefined || pattern.length === 0) {
    return null;
  }
  try {
    return new RegExp(pattern);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : 'not a valid regular expression';
    throw new Error(`Invalid PROCESSING_FAILURE_PATTERN "${pattern}": ${reason}`);
  }
}

export function buildContainer(env: Env): Container {
  const baseLogger = createLogger(env);
  const logger = new PinoLoggerAdapter(baseLogger);
  const metrics = new EngineMetrics();

  const prismaConnection = new PrismaConnection(env);
  const redisConnection = new RedisConnection(env.REDIS_URL, logger.child({ component: 'redis-connection' }));

  const eventStore = new PrismaEventRecordRepository(prismaConnection.client);
  const deadLetterStore = new PrismaDeadLetterStore(prismaConnection.client);

  const streamPublisher = new RedisStreamPublisher({
    redis: redisConnection.raw,
    streamName: env.REDIS_STREAM_NAME,
    maxLength: env.REDIS_STREAM_MAX_LENGTH,
    logger: logger.child({ component: 'stream-publisher' }),
  });

  const streamProcessor = new StreamEventProcessor(
    metrics,
    logger.child({ component: 'stream-processor' }),
    compileFailurePattern(env.PROCESSING_FAILURE_PATTERN),
  );

  const eventConsumer = new RedisStreamConsumer({
    redis: redisConnection.raw,
    config: {
      streamName: env.REDIS_STREAM_NAME,
      consumerGroup: env.REDIS_CONSUMER_GROUP,
      consumerName: env.REDIS_CONSUMER_NAME,
      batchSize: env.REDIS_CONSUMER_BATCH_SIZE,
      blockMs: env.REDIS_CONSUMER_BLOCK_MS,
      reclaimIdleMs: env.REDIS_CONSUMER_RECLAIM_IDLE_MS,
      reclaimIntervalMs: env.REDIS_CONSUMER_RECLAIM_INTERVAL_MS,
      maxDeliveryAttempts: env.REDIS_MAX_DELIVERY_ATTEMPTS,
    },
    handler: streamProcessor,
    deadLetterStore,
    logger: logger.child({ component: 'stream-consumer' }),
    metrics,
  });

  const eventController = new EventController({
    ingest: new IngestEventHandler(eventStore, streamPublisher, metrics, logger.child({ component: 'ingest-event' })),
    getById: new GetEventByIdHandler(eventStore),
    list: new ListEventsHandler(eventStore),
    deadLetters: new ListDeadLettersHandler(deadLetterStore),
    replayDeadLetter: new ReplayDeadLetterHandler(
      deadLetterStore,
      eventStore,
      streamPublisher,
      logger.child({ component: 'replay-dead-letter' }),
    ),
  });

  const checkDatabase = async (): Promise<void> => {
    const result = await withTimeout(
      prismaConnection.client.$queryRaw`SELECT 1`,
      READY_CHECK_TIMEOUT_MS,
      'PostgreSQL health check',
    );
    if (!Array.isArray(result)) {
      throw new Error('Unexpected result from PostgreSQL health check query');
    }
  };

  const checkRedis = async (): Promise<void> => {
    const reply = await withTimeout(redisConnection.raw.ping(), READY_CHECK_TIMEOUT_MS, 'Redis health check');
    if (reply !== 'PONG') {
      throw new Error(`Unexpected Redis PING reply: ${String(reply)}`);
    }
  };

  return {
    env,
    logger,
    baseLogger,
    metrics,
    prismaConnection,
    redisConnection,
    eventConsumer,
    eventController,
    readiness: { checkDatabase, checkRedis },
    metricsEndpoint: {
      read: (): Promise<string> => metrics.registry.metrics(),
      contentType: metrics.registry.contentType,
    },
  };
}
