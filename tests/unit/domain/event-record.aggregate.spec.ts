import { describe, expect, it } from 'vitest';

import { EventRecord } from '../../../src/domain/entities/event-record.aggregate.js';
import { InvalidEventError } from '../../../src/domain/errors/event-record.errors.js';

const VALID_INPUT = {
  eventId: null,
  eventType: 'order.created',
  aggregateType: 'order',
  aggregateId: 'order-42',
  payload: { amount: 125.5, currency: 'EUR' },
  metadata: null,
  occurredAt: null,
} as const;

describe('EventRecord', (): void => {
  it('creates an aggregate and records exactly one domain event', (): void => {
    const record = EventRecord.create(VALID_INPUT);

    expect(record.eventType.value).toBe('order.created');
    expect(record.aggregateType).toBe('order');
    expect(record.aggregateId).toBe('order-42');
    expect(record.version).toBe(1);
    expect(record.sequence).toBeNull();
    expect(record.hasPendingDomainEvents).toBe(true);

    const events = record.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(record.pullDomainEvents()).toHaveLength(0);
  });

  it('uses a caller-supplied event id to support idempotent ingestion', (): void => {
    const eventId = '3f8f6a1e-9b2c-4d5e-8f70-1a2b3c4d5e6f';
    const record = EventRecord.create({ ...VALID_INPUT, eventId });

    expect(record.id.value).toBe(eventId);
  });

  it('rejects malformed event types', (): void => {
    expect((): void => {
      EventRecord.create({ ...VALID_INPUT, eventType: 'ORDER CREATED!' });
    }).toThrow(InvalidEventError);
  });

  it('rejects empty payloads', (): void => {
    expect((): void => {
      EventRecord.create({ ...VALID_INPUT, payload: {} });
    }).toThrow(InvalidEventError);
  });

  it('normalizes event type casing', (): void => {
    const record = EventRecord.create({ ...VALID_INPUT, eventType: 'Order.Created' });
    expect(record.eventType.value).toBe('order.created');
  });
});
