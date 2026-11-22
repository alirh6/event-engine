import type { Redis } from 'ioredis';

import type { EventStreamPublisher } from '../../application/ports/event-stream-publisher.port.js';
import type { LoggerPort } from '../../application/ports/logger.port.js';
import type { DomainEvent } from '../../domain/events/domain-event.base.js';
import { EventRecordedDomainEvent } from '../../domain/events/event-recorded.domain-event.js';
import { withTimeout } from '../../shared/with-timeout.js';

/** Raised when an event type cannot be mapped onto the stream format. */
export class UnsupportedDomainEventError extends Error {
  public constructor(eventTypeName: string) {
    super(`Domain event "${eventTypeName}" cannot be published to the event stream`);
    this.name = 'UnsupportedDomainEventError';
  }
}

const DEFAULT_PUBLISH_TIMEOUT_MS = 5_000;

export interface RedisStreamPublisherOptions {
  readonly redis: Redis;
  readonly streamName: string;
  /** Approximate cap applied via `MAXLEN ~` to bound stream memory. */
  readonly maxLength: number;
  readonly logger: LoggerPort;
  /**
   * Upper bound on the XADD wait. Without it an ingest hangs for the whole
   * broker outage (ioredis offline queue + `maxRetriesPerRequest: null`).
   * Abandoning the wait leaves the command queued, so it can still flush on
   * reconnect — the API fails fast while delivery becomes eventually-consistent.
   */
  readonly publishTimeoutMs?: number;
}

/** Publishes domain events onto a capped Redis Stream as flat field/value pairs. */
export class RedisStreamPublisher implements EventStreamPublisher {
  public constructor(private readonly options: RedisStreamPublisherOptions) {}

  public async publish(event: DomainEvent): Promise<void> {
    if (!(event instanceof EventRecordedDomainEvent)) {
      throw new UnsupportedDomainEventError(event.name);
    }

    const { redis, streamName, maxLength, logger } = this.options;
    const publishTimeoutMs = this.options.publishTimeoutMs ?? DEFAULT_PUBLISH_TIMEOUT_MS;

    await withTimeout(
      redis.call(
        'XADD',
        streamName,
        'MAXLEN',
        '~',
        String(maxLength),
        '*',
        'eventId',
        event.eventId.value,
        'eventType',
        event.eventType.value,
        'aggregateType',
        event.aggregateType,
        'aggregateId',
        event.aggregateId,
        'version',
        String(event.version),
        'occurredAt',
        event.occurredAt.toISOString(),
        'payload',
        JSON.stringify(event.payload.value),
        'metadata',
        JSON.stringify(event.metadata.toJSON()),
      ),
      publishTimeoutMs,
      `XADD publish to ${streamName}`,
    );

    logger.debug('Published event to stream', {
      streamName,
      eventId: event.eventId.value,
      eventType: event.eventType.value,
    });
  }
}
