import { describe, expect, it } from 'vitest';

import {
  parseEntryList,
  parsePendingEntries,
  parseXReadResponse,
} from '../../../src/infrastructure/redis/stream-response.parser.js';

describe('parseXReadResponse', (): void => {
  it('parses the nested XREADGROUP reply into entries with field maps', (): void => {
    const reply = [['events:stream', [['1-1', ['eventId', 'abc', 'eventType', 'order.created']]]]];

    const entries = parseXReadResponse(reply);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ id: '1-1', fields: { eventId: 'abc', eventType: 'order.created' } });
  });

  it('returns an empty list for null or malformed replies', (): void => {
    expect(parseXReadResponse(null)).toEqual([]);
    expect(parseXReadResponse([])).toEqual([]);
    expect(parseXReadResponse(['not-a-stream'])).toEqual([]);
    expect(parseXReadResponse([['stream', 'not-an-array']])).toEqual([]);
  });
});

describe('parseEntryList', (): void => {
  it('parses flat XCLAIM/XRANGE replies', (): void => {
    const reply = [
      ['1-2', ['eventId', 'def', 'payload', '{"a":1}']],
      ['1-3', ['eventType', 'payment.settled']],
    ];

    const entries = parseEntryList(reply);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.id).toBe('1-2');
    expect(entries[0]?.fields['payload']).toBe('{"a":1}');
    expect(entries[1]?.fields['eventType']).toBe('payment.settled');
  });

  it('drops entries with unexpected shapes instead of throwing', (): void => {
    expect(parseEntryList([null, 'garbage', ['id-only']])).toEqual([]);
  });
});

describe('parsePendingEntries', (): void => {
  it('extracts delivery counts from the extended XPENDING reply', (): void => {
    const reply = [
      ['1-1', 'worker-1', 60_000, 3],
      ['1-2', 'worker-1', 61_000, 1],
    ];

    const pending = parsePendingEntries(reply);

    expect(pending).toEqual([
      { id: '1-1', deliveryCount: 3 },
      { id: '1-2', deliveryCount: 1 },
    ]);
  });

  it('defaults the delivery count when the reply is degraded', (): void => {
    const pending = parsePendingEntries([['1-1', 'worker-1', 60_000]]);

    expect(pending).toEqual([{ id: '1-1', deliveryCount: 1 }]);
  });
});
