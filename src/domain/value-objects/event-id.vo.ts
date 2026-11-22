import { randomUUID } from 'node:crypto';

import { InvalidEventError } from '../errors/event-record.errors.js';
import type { Identifier } from '../shared/identifier.js';
import { UUID_PATTERN } from '../shared/patterns.js';

/** Unique identity of an event record. Generated server-side by default, or supplied by the client for idempotent ingestion. */
export class EventId implements Identifier<string> {
  private constructor(public readonly value: string) {}

  public static generate(): EventId {
    return new EventId(randomUUID());
  }

  public static from(value: string): EventId {
    if (!UUID_PATTERN.test(value)) {
      throw new InvalidEventError('eventId must be a valid UUID');
    }
    return new EventId(value.toLowerCase());
  }

  public equals(other: Identifier<string>): boolean {
    return other instanceof EventId && other.value === this.value;
  }

  public toString(): string {
    return this.value;
  }
}
