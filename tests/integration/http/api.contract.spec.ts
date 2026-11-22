import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { IngestEventHandler } from '../../../src/application/commands/ingest-event.handler.js';
import { ReplayDeadLetterHandler } from '../../../src/application/commands/replay-dead-letter.handler.js';
import type {
  DeadLetterEntry,
  DeadLetterFilter,
  DeadLetterInput,
  DeadLetterStore,
  PaginatedDeadLetters,
} from '../../../src/application/ports/dead-letter-store.port.js';
import type { EventStreamPublisher } from '../../../src/application/ports/event-stream-publisher.port.js';
import type { LoggerPort, LogContext } from '../../../src/application/ports/logger.port.js';
import type { EventProcessingStatus, MetricsPort } from '../../../src/application/ports/metrics.port.js';
import { GetEventByIdHandler } from '../../../src/application/queries/get-event-by-id.handler.js';
import { ListDeadLettersHandler } from '../../../src/application/queries/list-dead-letters.handler.js';
import { ListEventsHandler } from '../../../src/application/queries/list-events.handler.js';
import type { DomainEvent } from '../../../src/domain/events/domain-event.base.js';
import { EventRecord } from '../../../src/domain/entities/event-record.aggregate.js';
import { EventRecordAlreadyExistsError } from '../../../src/domain/errors/event-record.errors.js';
import type { AggregateId } from '../../../src/domain/value-objects/aggregate-id.vo.js';
import type { EventId } from '../../../src/domain/value-objects/event-id.vo.js';
import type {
  EventRecordFilter,
  EventRecordRepository,
  PaginatedResult,
} from '../../../src/domain/repositories/event-record.repository.js';
import { EventController } from '../../../src/interfaces/http/controllers/event.controller.js';
import { buildServer } from '../../../src/interfaces/http/server.js';

const SAMPLE_METRICS = [
  '# HELP event_engine_events_ingested_total Total ingested',
  '# TYPE event_engine_events_ingested_total counter',
  'event_engine_events_ingested_total{eventType="order.created"} 7',
  '# TYPE event_engine_stream_length gauge',
  'event_engine_stream_length 42',
  '',
].join('\n');

const METRICS_CONTENT_TYPE = 'text/plain; version=0.0.1; charset=utf-8';

class InMemoryEventRecordRepository implements EventRecordRepository {
  public readonly records: EventRecord[] = [];

  public async append(record: EventRecord): Promise<void> {
    if (this.records.some((existing) => existing.id.equals(record.id))) {
      throw new EventRecordAlreadyExistsError(record.id.value);
    }
    record.attachSequence(BigInt(this.records.length + 1));
    this.records.push(record);
  }

  public async findById(id: EventId): Promise<EventRecord | null> {
    return this.records.find((record) => record.id.equals(id)) ?? null;
  }

  public async findByAggregate(aggregate: AggregateId): Promise<readonly EventRecord[]> {
    return this.records.filter(
      (record) => record.aggregateType === aggregate.aggregateType && record.aggregateId === aggregate.id,
    );
  }

  public async listPaginated(filter: EventRecordFilter): Promise<PaginatedResult<EventRecord>> {
    const sorted = [...this.records].sort((a, b) => Number((b.sequence ?? 0n) - (a.sequence ?? 0n)));
    const start = (filter.page - 1) * filter.pageSize;
    return {
      items: sorted.slice(start, start + filter.pageSize),
      total: this.records.length,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }
}

class InMemoryDeadLetterStore implements DeadLetterStore {
  public readonly entries: DeadLetterEntry[] = [];

  public async record(input: DeadLetterInput): Promise<void> {
    this.entries.push(makeDeadLetterEntry(input));
  }

  public async list(filter: DeadLetterFilter): Promise<PaginatedDeadLetters> {
    const sorted = [...this.entries].sort((a, b) => b.failedAt.getTime() - a.failedAt.getTime());
    const start = (filter.page - 1) * filter.pageSize;
    return {
      items: sorted.slice(start, start + filter.pageSize),
      total: this.entries.length,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  public async findById(id: string): Promise<DeadLetterEntry | null> {
    return this.entries.find((entry) => entry.id === id) ?? null;
  }

  public async delete(id: string): Promise<void> {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index >= 0) {
      this.entries.splice(index, 1);
    }
  }
}

function makeDeadLetterEntry(input: DeadLetterInput, overrides?: Partial<DeadLetterEntry>): DeadLetterEntry {
  return {
    id: randomUUID(),
    streamName: input.streamName,
    consumerGroup: input.consumerGroup,
    consumerName: input.consumerName,
    redisEntryId: input.redisEntryId,
    eventId: input.eventId,
    eventType: input.eventType,
    aggregateId: input.aggregateId,
    errorType: input.errorType,
    errorMessage: input.errorMessage,
    deliveryAttempts: input.deliveryAttempts,
    failedAt: new Date(),
    ...overrides,
  };
}

/** Simulates Prisma P2025: the row was removed by a concurrent replay. */
class P2025DeleteDeadLetterStore extends InMemoryDeadLetterStore {
  public override async delete(_id: string): Promise<void> {
    throw Object.assign(new Error('Record to delete does not exist'), { code: 'P2025' });
  }
}

class CollectingPublisher implements EventStreamPublisher {
  public readonly published: DomainEvent[] = [];

  public constructor(private readonly shouldFail = false) {}

  public async publish(event: DomainEvent): Promise<void> {
    if (this.shouldFail) {
      throw new Error('stream unavailable');
    }
    this.published.push(event);
  }
}

class RecordingMetrics implements MetricsPort {
  public readonly ingestedEventTypes: string[] = [];
  public readonly processed: { status: EventProcessingStatus; eventType: string }[] = [];
  public readonly streamLengths: number[] = [];

  public recordEventIngested(eventType: string): void {
    this.ingestedEventTypes.push(eventType);
  }

  public recordIngestDuration(_eventType: string, _durationSeconds: number): void {
    // observed through request latency assertions; nothing to record here
  }

  public recordEventProcessed(status: EventProcessingStatus, eventType: string): void {
    this.processed.push({ status, eventType });
  }

  public recordStreamLength(length: number): void {
    this.streamLengths.push(length);
  }

  public recordHttpRequest(_method: string, _route: string, _statusCode: number, _durationSeconds: number): void {
    // exercised by the HTTP metrics tests of the real EngineMetrics
  }
}

class MemoryLogger implements LoggerPort {
  public readonly entries: { level: string; message: string }[] = [];

  public debug(message: string): void {
    this.entries.push({ level: 'debug', message });
  }

  public info(message: string): void {
    this.entries.push({ level: 'info', message });
  }

  public warn(message: string): void {
    this.entries.push({ level: 'warn', message });
  }

  public error(message: string): void {
    this.entries.push({ level: 'error', message });
  }

  public child(_context: LogContext): LoggerPort {
    return this;
  }
}

interface IngestResponseBody {
  readonly id: string;
  readonly eventType: string;
  readonly version: number;
  readonly sequence: string | null;
}

interface ErrorResponseBody {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string;
  readonly requestId: string;
  readonly details?: { readonly fieldErrors?: Record<string, string[]> };
}

interface EventListItemBody {
  readonly id: string;
  readonly eventType: string;
  readonly sequence: string | null;
}

interface ListResponseBody {
  readonly items: readonly EventListItemBody[];
  readonly total: number;
  readonly totalPages: number;
}

interface DeadLetterListItemBody {
  readonly redisEntryId: string;
  readonly deliveryAttempts: number;
}

interface DeadLettersResponseBody {
  readonly items: readonly DeadLetterListItemBody[];
  readonly total: number;
  readonly page: number;
  readonly totalPages: number;
}

interface ReplayResponseBody {
  readonly replayed: boolean;
  readonly deadLetterId: string;
  readonly eventId: string;
}

interface HealthBody {
  readonly status: string;
  readonly uptimeSeconds: number;
}

interface ReadyBody {
  readonly status: string;
  readonly checks: { readonly database: string; readonly redis: string };
}

interface HarnessOptions {
  readonly publisherFails?: boolean;
  readonly rateLimitMax?: number;
  /** Simulates a concurrent replay: the delete loses the race with P2025. */
  readonly deadLetterDeleteFailsWithP2025?: boolean;
}

interface Harness {
  readonly app: FastifyInstance;
  readonly repository: InMemoryEventRecordRepository;
  readonly deadLetters: InMemoryDeadLetterStore;
  readonly publisher: CollectingPublisher;
  readonly metrics: RecordingMetrics;
  readonly logger: MemoryLogger;
  setDatabaseHealthy(healthy: boolean): void;
  setRedisHealthy(healthy: boolean): void;
}

async function buildHarness(options: HarnessOptions = {}): Promise<Harness> {
  const repository = new InMemoryEventRecordRepository();
  const deadLetters =
    options.deadLetterDeleteFailsWithP2025 === true ? new P2025DeleteDeadLetterStore() : new InMemoryDeadLetterStore();
  const publisher = new CollectingPublisher(options.publisherFails === true);
  const metrics = new RecordingMetrics();
  const logger = new MemoryLogger();

  const controller = new EventController({
    ingest: new IngestEventHandler(repository, publisher, metrics, logger),
    getById: new GetEventByIdHandler(repository),
    list: new ListEventsHandler(repository),
    deadLetters: new ListDeadLettersHandler(deadLetters),
    replayDeadLetter: new ReplayDeadLetterHandler(deadLetters, repository, publisher, logger),
  });

  let databaseHealthy = true;
  let redisHealthy = true;

  const app = await buildServer({
    httpLogger: pino({ level: 'silent' }),
    logger,
    metrics,
    corsOrigin: true,
    rateLimitMax: options.rateLimitMax ?? 10_000,
    controller,
    readiness: {
      checkDatabase: async (): Promise<void> => {
        if (!databaseHealthy) {
          throw new Error('postgres down');
        }
      },
      checkRedis: async (): Promise<void> => {
        if (!redisHealthy) {
          throw new Error('redis down');
        }
      },
    },
    metricsEndpoint: {
      read: async (): Promise<string> => SAMPLE_METRICS,
      contentType: METRICS_CONTENT_TYPE,
    },
  });

  return {
    app,
    repository,
    deadLetters,
    publisher,
    metrics,
    logger,
    setDatabaseHealthy: (healthy: boolean): void => {
      databaseHealthy = healthy;
    },
    setRedisHealthy: (healthy: boolean): void => {
      redisHealthy = healthy;
    },
  };
}

function makeRecord(eventType = 'order.created'): EventRecord {
  return EventRecord.create({
    eventId: null,
    eventType,
    aggregateType: 'order',
    aggregateId: 'order-42',
    payload: { amount: 10 },
    metadata: null,
    occurredAt: null,
  });
}

const VALID_INGEST_BODY = {
  eventType: 'order.created',
  aggregateType: 'order',
  aggregateId: 'order-42',
  payload: { amount: 125.5, currency: 'EUR' },
};

describe('POST /v1/events', (): void => {
  it('ingests a valid event and publishes it', async (): Promise<void> => {
    const harness = await buildHarness();

    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/events',
      payload: VALID_INGEST_BODY,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<IngestResponseBody>();
    expect(body.eventType).toBe('order.created');
    expect(body.version).toBe(1);
    expect(body.sequence).toBe('1');
    expect(typeof body.id).toBe('string');
    expect(harness.repository.records).toHaveLength(1);
    expect(harness.publisher.published).toHaveLength(1);
    expect(harness.publisher.published[0]?.name).toBe('EventRecordedDomainEvent');
    expect(harness.metrics.ingestedEventTypes).toEqual(['order.created']);
  });

  it('maps zod validation failures to a clean 400 with field errors', async (): Promise<void> => {
    const harness = await buildHarness();

    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/events',
      payload: { eventType: 'BAD TYPE!!', aggregateType: 'order', aggregateId: '', payload: {} },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<ErrorResponseBody>();
    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('Bad Request');
    expect(body.message).toBe('Request body failed schema validation');
    expect(typeof body.requestId).toBe('string');
    expect(Object.keys(body.details?.fieldErrors ?? {})).toContain('eventType');
    expect(Object.keys(body.details?.fieldErrors ?? {})).toContain('payload');
    expect(harness.repository.records).toHaveLength(0);
  });

  it('rejects duplicate event ids with 409', async (): Promise<void> => {
    const harness = await buildHarness();
    const eventId = randomUUID();
    const payload = { ...VALID_INGEST_BODY, eventId };

    await harness.app.inject({ method: 'POST', url: '/v1/events', payload });
    const second = await harness.app.inject({ method: 'POST', url: '/v1/events', payload });

    expect(second.statusCode).toBe(409);
    expect(second.json<ErrorResponseBody>().message).toContain('already exists');
  });
});

describe('GET /v1/events', (): void => {
  it('lists events newest first with pagination metadata', async (): Promise<void> => {
    const harness = await buildHarness();
    for (let index = 0; index < 3; index += 1) {
      await harness.app.inject({ method: 'POST', url: '/v1/events', payload: VALID_INGEST_BODY });
    }

    const response = await harness.app.inject({ method: 'GET', url: '/v1/events?page=1&pageSize=2' });

    expect(response.statusCode).toBe(200);
    const body = response.json<ListResponseBody>();
    expect(body.total).toBe(3);
    expect(body.totalPages).toBe(2);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]?.sequence).toBe('3');
    expect(body.items[1]?.sequence).toBe('2');
  });

  it('rejects invalid pagination with 400', async (): Promise<void> => {
    const harness = await buildHarness();
    const response = await harness.app.inject({ method: 'GET', url: '/v1/events?page=0' });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /v1/events/:id', (): void => {
  it('returns the event when it exists', async (): Promise<void> => {
    const harness = await buildHarness();
    const created = await harness.app.inject({ method: 'POST', url: '/v1/events', payload: VALID_INGEST_BODY });

    const response = await harness.app.inject({
      method: 'GET',
      url: `/v1/events/${created.json<IngestResponseBody>().id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<IngestResponseBody>().eventType).toBe('order.created');
  });

  it('returns a clean 404 for unknown ids', async (): Promise<void> => {
    const harness = await buildHarness();
    const response = await harness.app.inject({ method: 'GET', url: `/v1/events/${randomUUID()}` });

    expect(response.statusCode).toBe(404);
    expect(response.json<ErrorResponseBody>().error).toBe('Not Found');
  });

  it('returns 400 for malformed ids', async (): Promise<void> => {
    const harness = await buildHarness();
    const response = await harness.app.inject({ method: 'GET', url: '/v1/events/not-a-uuid' });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /v1/dead-letters', (): void => {
  it('returns an empty page when nothing has dead-lettered', async (): Promise<void> => {
    const harness = await buildHarness();
    const response = await harness.app.inject({ method: 'GET', url: '/v1/dead-letters' });

    expect(response.statusCode).toBe(200);
    expect(response.json<DeadLettersResponseBody>()).toMatchObject({
      items: [],
      total: 0,
      page: 1,
      totalPages: 1,
    });
  });

  it('lists dead letters newest first', async (): Promise<void> => {
    const harness = await buildHarness();
    const older = makeDeadLetterEntry(
      {
        streamName: 'events:stream',
        consumerGroup: 'engine-workers',
        consumerName: 'worker-1',
        redisEntryId: '1-1',
        eventId: null,
        eventType: 'order.created',
        aggregateId: 'order-42',
        payload: '{}',
        errorType: 'MaxDeliveryAttemptsExceeded',
        errorMessage: 'too many attempts',
        deliveryAttempts: 3,
      },
      { failedAt: new Date('2026-01-01T10:00:00Z') },
    );
    const newer = makeDeadLetterEntry(
      {
        streamName: 'events:stream',
        consumerGroup: 'engine-workers',
        consumerName: 'worker-1',
        redisEntryId: '1-2',
        eventId: randomUUID(),
        eventType: 'payment.failed',
        aggregateId: 'pay-1',
        payload: '{}',
        errorType: 'MaxDeliveryAttemptsExceeded',
        errorMessage: 'too many attempts',
        deliveryAttempts: 5,
      },
      { failedAt: new Date('2026-01-01T11:00:00Z') },
    );
    harness.deadLetters.entries.push(older, newer);

    const response = await harness.app.inject({ method: 'GET', url: '/v1/dead-letters?page=1&pageSize=10' });

    expect(response.statusCode).toBe(200);
    const body = response.json<DeadLettersResponseBody>();
    expect(body.total).toBe(2);
    expect(body.items[0]?.redisEntryId).toBe('1-2');
    expect(body.items[1]?.redisEntryId).toBe('1-1');
    expect(body.items[0]?.deliveryAttempts).toBe(5);
  });
});

describe('POST /v1/dead-letters/:id/replay', (): void => {
  it('re-publishes the original event and removes the dead letter', async (): Promise<void> => {
    const harness = await buildHarness();
    const created = await harness.app.inject({ method: 'POST', url: '/v1/events', payload: VALID_INGEST_BODY });
    const eventId = created.json<IngestResponseBody>().id;
    const entry = makeDeadLetterEntry({
      streamName: 'events:stream',
      consumerGroup: 'engine-workers',
      consumerName: 'worker-1',
      redisEntryId: '1-9',
      eventId,
      eventType: 'order.created',
      aggregateId: 'order-42',
      payload: '{}',
      errorType: 'MaxDeliveryAttemptsExceeded',
      errorMessage: 'too many attempts',
      deliveryAttempts: 3,
    });
    harness.deadLetters.entries.push(entry);
    const publishedBefore = harness.publisher.published.length;

    const response = await harness.app.inject({ method: 'POST', url: `/v1/dead-letters/${entry.id}/replay` });

    expect(response.statusCode).toBe(200);
    expect(response.json<ReplayResponseBody>()).toMatchObject({
      replayed: true,
      deadLetterId: entry.id,
      eventId,
    });
    expect(harness.publisher.published.length).toBe(publishedBefore + 1);
    expect(harness.deadLetters.entries).toHaveLength(0);
  });

  it('returns 404 for unknown dead letter ids', async (): Promise<void> => {
    const harness = await buildHarness();
    const response = await harness.app.inject({ method: 'POST', url: `/v1/dead-letters/${randomUUID()}/replay` });
    expect(response.statusCode).toBe(404);
    expect(response.json<ErrorResponseBody>().message).toContain('Dead letter entry');
  });

  it('returns 400 when the entry carries no event id', async (): Promise<void> => {
    const harness = await buildHarness();
    const entry = makeDeadLetterEntry({
      streamName: 'events:stream',
      consumerGroup: 'engine-workers',
      consumerName: 'worker-1',
      redisEntryId: '1-8',
      eventId: null,
      eventType: null,
      aggregateId: null,
      payload: '{broken',
      errorType: 'MaxDeliveryAttemptsExceeded',
      errorMessage: 'poison message',
      deliveryAttempts: 5,
    });
    harness.deadLetters.entries.push(entry);

    const response = await harness.app.inject({ method: 'POST', url: `/v1/dead-letters/${entry.id}/replay` });

    expect(response.statusCode).toBe(400);
    expect(response.json<ErrorResponseBody>().message).toContain('cannot be replayed');
    expect(harness.deadLetters.entries).toHaveLength(1);
  });

  it('keeps the entry when publishing fails', async (): Promise<void> => {
    const harness = await buildHarness({ publisherFails: true });
    const record = makeRecord();
    await harness.repository.append(record);
    const entry = makeDeadLetterEntry({
      streamName: 'events:stream',
      consumerGroup: 'engine-workers',
      consumerName: 'worker-1',
      redisEntryId: '1-7',
      eventId: record.id.value,
      eventType: 'order.created',
      aggregateId: 'order-42',
      payload: '{}',
      errorType: 'MaxDeliveryAttemptsExceeded',
      errorMessage: 'too many attempts',
      deliveryAttempts: 3,
    });
    harness.deadLetters.entries.push(entry);

    const response = await harness.app.inject({ method: 'POST', url: `/v1/dead-letters/${entry.id}/replay` });

    expect(response.statusCode).toBe(500);
    expect(harness.deadLetters.entries).toHaveLength(1);
  });

  it('returns success when a concurrent replay already removed the entry', async (): Promise<void> => {
    const harness = await buildHarness({ deadLetterDeleteFailsWithP2025: true });
    const record = makeRecord();
    await harness.repository.append(record);
    const entry = makeDeadLetterEntry({
      streamName: 'events:stream',
      consumerGroup: 'engine-workers',
      consumerName: 'worker-1',
      redisEntryId: '1-6',
      eventId: record.id.value,
      eventType: 'order.created',
      aggregateId: 'order-42',
      payload: '{}',
      errorType: 'MaxDeliveryAttemptsExceeded',
      errorMessage: 'too many attempts',
      deliveryAttempts: 3,
    });
    harness.deadLetters.entries.push(entry);
    const publishedBefore = harness.publisher.published.length;

    const response = await harness.app.inject({ method: 'POST', url: `/v1/dead-letters/${entry.id}/replay` });

    // The replay published successfully; the lost delete race (P2025) must
    // not surface as a 500 after the event has already been re-published.
    expect(response.statusCode).toBe(200);
    expect(response.json<ReplayResponseBody>()).toMatchObject({ replayed: true, eventId: record.id.value });
    expect(harness.publisher.published.length).toBe(publishedBefore + 1);
  });
});

describe('health and metrics endpoints', (): void => {
  it('reports liveness with uptime', async (): Promise<void> => {
    const harness = await buildHarness();
    const response = await harness.app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.json<HealthBody>()).toMatchObject({ status: 'ok' });
    expect(typeof response.json<HealthBody>().uptimeSeconds).toBe('number');
  });

  it('reports readiness when dependencies are healthy', async (): Promise<void> => {
    const harness = await buildHarness();
    const response = await harness.app.inject({ method: 'GET', url: '/readyz' });

    expect(response.statusCode).toBe(200);
    expect(response.json<ReadyBody>()).toMatchObject({ status: 'ok', checks: { database: 'ok', redis: 'ok' } });
  });

  it('degrades readiness to 503 when a dependency fails', async (): Promise<void> => {
    const harness = await buildHarness();
    harness.setDatabaseHealthy(false);

    const response = await harness.app.inject({ method: 'GET', url: '/readyz' });

    expect(response.statusCode).toBe(503);
    const body = response.json<ReadyBody>();
    expect(body.status).toBe('unavailable');
    expect(body.checks.database).toContain('postgres down');
    expect(body.checks.redis).toBe('ok');
  });

  it('exposes metrics with the Prometheus content type', async (): Promise<void> => {
    const harness = await buildHarness();
    const response = await harness.app.inject({ method: 'GET', url: '/metrics' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(SAMPLE_METRICS);
    expect(response.headers['content-type']).toContain(METRICS_CONTENT_TYPE);
  });
});

describe('cross-cutting HTTP behavior', (): void => {
  it('returns the structured 404 envelope for unknown routes', async (): Promise<void> => {
    const harness = await buildHarness();
    const response = await harness.app.inject({ method: 'GET', url: '/does-not-exist' });

    expect(response.statusCode).toBe(404);
    const body = response.json<ErrorResponseBody>();
    expect(body.error).toBe('Not Found');
    expect(body.message).toContain('/does-not-exist');
    expect(typeof body.requestId).toBe('string');
  });

  it('reflects allowed CORS origins', async (): Promise<void> => {
    const harness = await buildHarness();
    const response = await harness.app.inject({
      method: 'GET',
      url: '/v1/events',
      headers: { origin: 'http://localhost:3100' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3100');
  });

  it('rate limits abusive clients with 429', async (): Promise<void> => {
    const harness = await buildHarness({ rateLimitMax: 1 });

    const first = await harness.app.inject({ method: 'POST', url: '/v1/events', payload: VALID_INGEST_BODY });
    const second = await harness.app.inject({ method: 'POST', url: '/v1/events', payload: VALID_INGEST_BODY });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(429);
  });
});
