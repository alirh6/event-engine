import { EventId } from '../../domain/value-objects/event-id.vo.js';
import { DeadLetterNotFoundError } from '../../domain/errors/dead-letter.errors.js';
import { EventRecordNotFoundError, InvalidEventError } from '../../domain/errors/event-record.errors.js';
import type { EventRecordRepository } from '../../domain/repositories/event-record.repository.js';
import type { DeadLetterEntry, DeadLetterStore } from '../ports/dead-letter-store.port.js';
import type { EventStreamPublisher } from '../ports/event-stream-publisher.port.js';
import type { LoggerPort } from '../ports/logger.port.js';
import type { ReplayDeadLetterResponseDto } from '../dtos/dead-letter.dtos.js';

/** Command carrying the id of the dead-letter entry to replay. */
export interface ReplayDeadLetterCommand {
  readonly id: string;
}

/**
 * Recovery use case: re-publishes the original event from the event store
 * onto the stream (full fidelity — payload, metadata, occurred-at), then
 * removes the dead-letter row. If publishing fails the entry is kept so the
 * replay can be retried.
 */
export class ReplayDeadLetterHandler {
  public constructor(
    private readonly deadLetters: DeadLetterStore,
    private readonly eventStore: EventRecordRepository,
    private readonly streamPublisher: EventStreamPublisher,
    private readonly logger: LoggerPort,
  ) {}

  public async execute(command: ReplayDeadLetterCommand): Promise<ReplayDeadLetterResponseDto> {
    const entry = await this.deadLetters.findById(command.id);
    if (entry === null) {
      throw new DeadLetterNotFoundError(command.id);
    }

    const eventId = parseEventId(entry);
    const record = await this.eventStore.findById(eventId);
    if (record === null) {
      // The event store is the source of truth; without the original record
      // there is nothing faithful to replay.
      throw new EventRecordNotFoundError(eventId.value);
    }

    await this.streamPublisher.publish(record.toRecordedEvent());
    try {
      await this.deadLetters.delete(entry.id);
    } catch (error: unknown) {
      // A concurrent replay can remove the entry after we have already
      // published; that race must not surface as a 500 — the replay itself
      // succeeded. The duplicate publication risk is inherent to at-least-once
      // delivery and is documented in the README.
      if (!isConcurrentDeleteRace(error)) {
        throw error;
      }
      this.logger.warn('Dead letter entry was already removed by a concurrent replay', {
        deadLetterId: entry.id,
        eventId: record.id.value,
      });
    }

    this.logger.info('Dead letter replayed onto the stream', {
      deadLetterId: entry.id,
      eventId: record.id.value,
      eventType: record.eventType.value,
      originalRedisEntryId: entry.redisEntryId,
    });

    return { replayed: true, deadLetterId: entry.id, eventId: record.id.value };
  }
}

function parseEventId(entry: DeadLetterEntry): EventId {
  if (entry.eventId === null) {
    throw new InvalidEventError(`Dead letter entry "${entry.id}" has no event id and cannot be replayed`);
  }
  try {
    return EventId.from(entry.eventId);
  } catch {
    throw new InvalidEventError(`Dead letter entry "${entry.id}" has a malformed event id and cannot be replayed`);
  }
}

/** Detects Prisma P2025 ("record to delete no longer exists") structurally. */
function isConcurrentDeleteRace(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'P2025';
}
