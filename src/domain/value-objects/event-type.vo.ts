import { InvalidEventError } from '../errors/event-record.errors.js';
import { ensureNonEmptyString } from '../shared/guard.js';
import { EVENT_TYPE_PATTERN } from '../shared/patterns.js';

/**
 * Categorizes an event with a lowercase, dot/underscore-separated token
 * such as `order.created`. Input is normalized to lowercase on creation.
 */
export class EventType {
  private constructor(public readonly value: string) {}

  public static from(value: string): EventType {
    const normalized = ensureNonEmptyString(value, 'eventType', 128).toLowerCase();
    if (!EVENT_TYPE_PATTERN.test(normalized)) {
      throw new InvalidEventError(
        `eventType "${normalized}" must be a lowercase dot/underscore separated token such as 'order.created'`,
      );
    }
    return new EventType(normalized);
  }

  public equals(other: EventType): boolean {
    return other.value === this.value;
  }

  public toString(): string {
    return this.value;
  }
}
