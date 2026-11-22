import 'dotenv/config';
import type { FastifyInstance } from 'fastify';

import { loadEnv } from './infrastructure/config/env.config.js';
import { buildContainer } from './infrastructure/di/container.js';
import { buildServer } from './interfaces/http/server.js';
import { errorInfo } from './shared/errors.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const container = buildContainer(env);
  const { logger } = container;

  await container.prismaConnection.connect();
  await container.redisConnection.connect();

  const app: FastifyInstance = await buildServer({
    httpLogger: container.baseLogger,
    logger: container.logger,
    metrics: container.metrics,
    corsOrigin:
      env.CORS_ORIGINS === '*'
        ? true
        : env.CORS_ORIGINS.split(',')
            .map((origin) => origin.trim())
            .filter((origin) => origin.length > 0),
    rateLimitMax: env.RATE_LIMIT_MAX,
    controller: container.eventController,
    readiness: container.readiness,
    metricsEndpoint: container.metricsEndpoint,
  });

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  await container.eventConsumer.start();

  logger.info('Event engine started', {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    streamName: env.REDIS_STREAM_NAME,
    consumerGroup: env.REDIS_CONSUMER_GROUP,
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info('Graceful shutdown initiated', { signal });

    const perform = async (): Promise<void> => {
      await container.eventConsumer.stop();
      await app.close();
      container.metrics.stop();
      await container.redisConnection.disconnect();
      await container.prismaConnection.disconnect();
      logger.info('Graceful shutdown complete');
      process.exit(0);
    };

    perform().catch((error: unknown) => {
      logger.error('Forced exit after shutdown failure', errorInfo(error));
      process.exit(1);
    });

    setTimeout((): void => {
      logger.error('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  };

  process.on('SIGTERM', (): void => shutdown('SIGTERM'));
  process.on('SIGINT', (): void => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason: unknown): void => {
    logger.error('Unhandled promise rejection; terminating', errorInfo(reason));
    shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (error: unknown): void => {
    logger.error('Uncaught exception; terminating', errorInfo(error));
    process.exit(1);
  });
}

bootstrap().catch((error: unknown): void => {
  console.error('Fatal error during bootstrap:', error);
  process.exit(1);
});
