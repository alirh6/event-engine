import { performance } from 'node:perf_hooks';

import type { LoggerPort } from '../ports/logger.port.js';
import type { MetricsPort } from '../ports/metrics.port.js';
import type { StreamEntry, StreamMessageHandler } from '../ports/stream-message-handler.port.js';
import { z } from 'zod';

/** Fully decoded, validated message as it flows through the processing pipeline. */
export interface StreamMessage {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly version: number;
  readonly occurredAt: Date;
  readonly payload: unknown;
  readonly metadata: Record<string, unknown> | null;
}

/** Raised when a stream entry cannot be decoded into a `StreamMessage`. */
export class InvalidStreamMessageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'InvalidStreamMessageError';
  }
}

/** Raised when fault injection (PROCESSING_FAILURE_PATTERN) is enabled and matches. */
export class SimulatedProcessingFailureError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SimulatedProcessingFailureError';
  }
}

const StreamMessageSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().min(1).max(128),
  aggregateType: z.string().min(1).max(64),
  aggregateId: z.string().min(1).max(128),
  version: z.number().int().positive(),
  occurredAt: z.coerce.date(),
  payload: z.unknown(),
  metadata: z.record(z.unknown()).nullable(),
});

/** Contract for business handlers that act on a specific event type. */
export interface TypedEventHandler {
  handle(message: StreamMessage): Promise<void>;
}

/**
 * Consumer-side use case. Decodes and validates raw stream entries, then
 * dispatches them to the handler registered for the event type. Entries
 * without a registered handler are validated and acknowledged.
 */
export class StreamEventProcessor implements StreamMessageHandler {
  private readonly handlersByEventType = new Map<string, TypedEventHandler>();

  public constructor(
    private readonly metrics: MetricsPort,
    private readonly logger: LoggerPort,
    private readonly failurePattern: RegExp | null = null,
  ) {}

  /** Registers the business handler responsible for an event type. */
  public registerHandler(eventType: string, handler: TypedEventHandler): void {
    this.handlersByEventType.set(eventType, handler);
  }

  public async handle(entry: StreamEntry): Promise<void> {
    const startedAt = performance.now();
    const message = this.decode(entry);

    if (this.failurePattern?.test(message.eventType) === true) {
      throw new SimulatedProcessingFailureError(
        `Processing of "${message.eventType}" failed (fault injection is enabled via PROCESSING_FAILURE_PATTERN)`,
      );
    }

    const handler = this.handlersByEventType.get(message.eventType);
    if (handler !== undefined) {
      await handler.handle(message);
    } else {
      this.logger.debug('Acknowledged event without a registered handler', {
        eventId: message.eventId,
        eventType: message.eventType,
      });
    }

    this.metrics.recordEventProcessed('processed', message.eventType, (performance.now() - startedAt) / 1000);
  }

  private decode(entry: StreamEntry): StreamMessage {
    const payload = this.parseJsonField(entry.fields['payload'], 'payload', entry.id);
    const metadata = this.parseJsonField(entry.fields['metadata'] ?? '{}', 'metadata', entry.id);

    const parsed = StreamMessageSchema.safeParse({
      eventId: entry.fields['eventId'],
      eventType: entry.fields['eventType'],
      aggregateType: entry.fields['aggregateType'],
      aggregateId: entry.fields['aggregateId'],
      version: Number(entry.fields['version']),
      occurredAt: entry.fields['occurredAt'],
      payload,
      metadata,
    });
    if (!parsed.success) {
      throw new InvalidStreamMessageError(
        `Stream entry ${entry.id} does not match the canonical event message shape: ${parsed.error.message}`,
      );
    }
    return {
      eventId: parsed.data.eventId,
      eventType: parsed.data.eventType,
      aggregateType: parsed.data.aggregateType,
      aggregateId: parsed.data.aggregateId,
      version: parsed.data.version,
      occurredAt: parsed.data.occurredAt,
      payload: parsed.data.payload,
      metadata: parsed.data.metadata,
    };
  }

  private parseJsonField(raw: string | undefined, fieldName: string, entryId: string): unknown {
    if (raw === undefined || raw === null) {
      throw new InvalidStreamMessageError(`Stream entry ${entryId} is missing the "${fieldName}" field`);
    }
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new InvalidStreamMessageError(`Stream entry ${entryId} field "${fieldName}" is not valid JSON`);
    }
  }
}
