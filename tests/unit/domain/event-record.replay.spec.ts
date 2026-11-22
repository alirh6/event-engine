import { describe, expect, it } from 'vitest';

import { EventRecord } from '../../../src/domain/entities/event-record.aggregate.js';
import { EventRecordedDomainEvent } from '../../../src/domain/events/event-recorded.domain-event.js';

describe('EventRecord.toRecordedEvent', (): void => {
  it('rebuilds the domain event with full fidelity for stream replay', (): void => {
    const occurredAt = new Date('2026-01-01T09:30:00.000Z');
    const record = EventRecord.create({
      eventId: '3f8f6a1e-9b2c-4d5e-8f70-1a2b3c4d5e6f',
      eventType: 'order.created',
      aggregateType: 'order',
      aggregateId: 'order-42',
      payload: { amount: 42, currency: 'EUR' },
      metadata: { source: 'replay-test', correlationId: '3f8f6a1e-9b2c-4d5e-8f70-1a2b3c4d5e70' },
      occurredAt,
    });
    record.attachSequence(7n);

    const event: EventRecordedDomainEvent = record.toRecordedEvent();

    expect(event).toBeInstanceOf(EventRecordedDomainEvent);
    expect(event.eventId.value).toBe(record.id.value);
    expect(event.eventType.value).toBe('order.created');
    expect(event.aggregateType).toBe('order');
    expect(event.aggregateId).toBe('order-42');
    expect(event.version).toBe(1);
    expect(event.occurredAt).toBe(occurredAt);
    expect(event.payload.value).toEqual({ amount: 42, currency: 'EUR' });
    expect(event.metadata.source).toBe('replay-test');
  });
});
