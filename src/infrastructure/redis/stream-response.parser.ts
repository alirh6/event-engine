import type { StreamEntry } from '../../application/ports/stream-message-handler.port.js';

export interface PendingEntryInfo {
  readonly id: string;
  readonly deliveryCount: number;
}

/**
 * Defensive parsers for Redis Streams RESP2 replies. All commands are issued
 * through `redis.call`, so replies arrive as raw nested arrays.
 */

/** Parses an XREADGROUP reply: `[[streamName, [[entryId, [f, v, …]], …]], …]`. */
export function parseXReadResponse(response: unknown): StreamEntry[] {
  if (!Array.isArray(response)) {
    return [];
  }
  const entries: StreamEntry[] = [];
  for (const streamRecord of response) {
    if (!Array.isArray(streamRecord) || streamRecord.length < 2) {
      continue;
    }
    const rawEntries: unknown = streamRecord[1];
    if (!Array.isArray(rawEntries)) {
      continue;
    }
    for (const raw of rawEntries) {
      const entry = parseEntry(raw);
      if (entry !== null) {
        entries.push(entry);
      }
    }
  }
  return entries;
}

/** Parses a flat entry list as returned by XCLAIM or XRANGE. */
export function parseEntryList(response: unknown): StreamEntry[] {
  if (!Array.isArray(response)) {
    return [];
  }
  const entries: StreamEntry[] = [];
  for (const raw of response) {
    const entry = parseEntry(raw);
    if (entry !== null) {
      entries.push(entry);
    }
  }
  return entries;
}

/** Parses an extended XPENDING reply: `[[entryId, consumer, idleMs, deliveryCount], …]`. */
export function parsePendingEntries(response: unknown): PendingEntryInfo[] {
  if (!Array.isArray(response)) {
    return [];
  }
  const pending: PendingEntryInfo[] = [];
  for (const raw of response) {
    if (!Array.isArray(raw)) {
      continue;
    }
    const rawId: unknown = raw[0];
    const rawDeliveryCount: unknown = raw[3];
    if (typeof rawId !== 'string') {
      continue;
    }
    const deliveryCount =
      typeof rawDeliveryCount === 'number' && Number.isInteger(rawDeliveryCount) && rawDeliveryCount > 0
        ? rawDeliveryCount
        : 1;
    pending.push({ id: rawId, deliveryCount });
  }
  return pending;
}

function parseEntry(raw: unknown): StreamEntry | null {
  if (!Array.isArray(raw) || raw.length < 2) {
    return null;
  }
  const id: unknown = raw[0];
  const rawFields: unknown = raw[1];
  if (typeof id !== 'string' || !Array.isArray(rawFields)) {
    return null;
  }
  const fields: Record<string, string> = {};
  for (let index = 0; index + 1 < rawFields.length; index += 2) {
    const key: unknown = rawFields[index];
    const value: unknown = rawFields[index + 1];
    if (typeof key === 'string' && typeof value === 'string') {
      fields[key] = value;
    }
  }
  return { id, fields };
}
