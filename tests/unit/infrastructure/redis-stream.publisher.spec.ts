import { describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';

import type { EventRecordedDomainEvent } from '../../../src/domain/events/event-recorded.domain-event.js';
import { EventRecord } from '../../../src/domain/entities/event-record.aggregate.js';
import {
  RedisStreamPublisher,
  UnsupportedDomainEventError,
} from '../../../src/infrastructure/redis/redis-stream.publisher.js';
import type { LoggerPort } from '../../../src/application/ports/logger.port.js';

const discardedLog: { level: string; message: string }[] = [];

const NULL_LOGGER: LoggerPort = {
  debug(message: string): void {
    discardedLog.push({ level: 'debug', message });
  },
  info(message: string): void {
    discardedLog.push({ level: 'info', message });
  },
  warn(message: string): void {
    discardedLog.push({ level: 'warn', message });
  },
  error(message: string): void {
    discardedLog.push({ level: 'error', message });
  },
  child(): LoggerPort {
    return NULL_LOGGER;
  },
};

function makeRecordedEvent(): EventRecordedDomainEvent {
  const record = EventRecord.create({
    eventId: null,
    eventType: 'order.created',
    aggregateType: 'order',
    aggregateId: 'order-42',
    payload: { amount: 1 },
    metadata: null,
    occurredAt: null,
  });
  const [event] = record.pullDomainEvents();
  if (event === undefined) {
    throw new Error('expected a domain event');
  }
  return event as EventRecordedDomainEvent;
}

function fakeRedis(callImpl: (...args: unknown[]) => Promise<unknown>): Redis {
  return { call: vi.fn(callImpl) } as unknown as Redis;
}

describe('RedisStreamPublisher', (): void => {
  it('publishes with the MAXLEN cap and canonical command shape', async (): Promise<void> => {
    let capturedArgs: unknown[] | undefined;
    const publisher = new RedisStreamPublisher({
      redis: fakeRedis(async (...args: unknown[]): Promise<string> => {
        capturedArgs = args;
        return '1-1';
      }),
      streamName: 'events:stream',
      maxLength: 1_000,
      logger: NULL_LOGGER,
    });

    await publisher.publish(makeRecordedEvent());

    expect(capturedArgs?.slice(0, 6)).toEqual(['XADD', 'events:stream', 'MAXLEN', '~', '1000', '*']);
    expect(capturedArgs).toContain('eventId');
    expect(capturedArgs).toContain('eventType');
  });

  it('rejects unsupported domain events before touching Redis', async (): Promise<void> => {
    const call = vi.fn(async (): Promise<string> => '1-1');
    const publisher = new RedisStreamPublisher({
      redis: { call } as unknown as Redis,
      streamName: 'events:stream',
      maxLength: 1_000,
      logger: NULL_LOGGER,
    });

    await expect(publisher.publish({ name: 'SomethingElse' } as never)).rejects.toBeInstanceOf(
      UnsupportedDomainEventError,
    );
    expect(call).not.toHaveBeenCalled();
  });

  it('fails fast when the broker does not answer within the publish timeout', async (): Promise<void> => {
    const publisher = new RedisStreamPublisher({
      redis: fakeRedis(() => new Promise(() => undefined)),
      streamName: 'events:stream',
      maxLength: 1_000,
      logger: NULL_LOGGER,
      publishTimeoutMs: 25,
    });

    const startedAt = Date.now();
    await expect(publisher.publish(makeRecordedEvent())).rejects.toThrow(/timed out/);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });
});
