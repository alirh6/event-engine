import { InvalidEventError } from '../errors/event-record.errors.js';

/**
 * The business payload of an event: a frozen, non-empty JSON object.
 * Shallow-frozen by design; nested structures are treated as opaque data.
 */
export class EventPayload {
  private constructor(public readonly value: Readonly<Record<string, unknown>>) {}

  public static from(value: unknown): EventPayload {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new InvalidEventError('payload must be a JSON object');
    }
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length === 0) {
      throw new InvalidEventError('payload must contain at least one property');
    }
    return new EventPayload(Object.freeze({ ...record }));
  }
}
