import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Redis } from 'ioredis';

import type { DeadLetterInput, DeadLetterStore } from '../../application/ports/dead-letter-store.port.js';
import type { LoggerPort } from '../../application/ports/logger.port.js';
import type { MetricsPort } from '../../application/ports/metrics.port.js';
import type { StreamEntry, StreamMessageHandler } from '../../application/ports/stream-message-handler.port.js';
import { errorInfo } from '../../shared/errors.js';
import { parseEntryList, parsePendingEntries, parseXReadResponse } from './stream-response.parser.js';

export interface RedisStreamConsumerConfig {
  readonly streamName: string;
  readonly consumerGroup: string;
  readonly consumerName: string;
  readonly batchSize: number;
  readonly blockMs: number;
  /** Entries pending longer than this are claimed back from stalled consumers. */
  readonly reclaimIdleMs: number;
  /** How often the consumer scans the pending list for reclaimable entries. */
  readonly reclaimIntervalMs: number;
  /** Delivery budget before an entry is moved to the dead-letter store. */
  readonly maxDeliveryAttempts: number;
}

export interface RedisStreamConsumerOptions {
  readonly redis: Redis;
  readonly config: RedisStreamConsumerConfig;
  readonly handler: StreamMessageHandler;
  readonly deadLetterStore: DeadLetterStore;
  readonly logger: LoggerPort;
  readonly metrics: MetricsPort;
}

const READ_ERROR_BACKOFF_MS = 2_000;

/**
 * At-least-once consumer over a Redis Stream consumer group:
 * - reads new entries via `XREADGROUP … BLOCK`;
 * - periodically reclaims entries abandoned by stalled consumers using
 *   `XPENDING`/`XCLAIM` after the idle threshold;
 * - dead-letters entries that exceeded `maxDeliveryAttempts` and
 *   acknowledges them so they never block the group.
 */
export class RedisStreamConsumer {
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private nextReclaimDueAt = 0;

  public constructor(private readonly options: RedisStreamConsumerOptions) {}

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }
    await this.ensureGroupExists();
    this.running = true;
    this.loopPromise = this.run().catch((error: unknown): void => {
      this.running = false;
      this.options.logger.error('Stream consumer loop terminated unexpectedly', errorInfo(error));
    });
    this.options.logger.info('Stream consumer started', {
      streamName: this.options.config.streamName,
      consumerGroup: this.options.config.consumerGroup,
      consumerName: this.options.config.consumerName,
      batchSize: this.options.config.batchSize,
    });
  }

  public async stop(): Promise<void> {
    this.running = false;
    const loop = this.loopPromise;
    if (loop !== null) {
      await loop;
    }
    this.loopPromise = null;
    this.options.logger.info('Stream consumer stopped');
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        await this.reclaimAbandonedEntriesIfDue();
        if (!this.running) {
          break;
        }
        const entries = await this.readNewEntries();
        if (entries.length > 0) {
          await this.processEntries(entries);
        } else {
          await this.recordStreamLength();
        }
      } catch (error: unknown) {
        if (!this.running) {
          break;
        }
        if (isNoGroupError(error)) {
          await this.ensureGroupExists();
          continue;
        }
        this.options.logger.error('Stream consumer iteration failed; backing off before retry', errorInfo(error));
        await sleep(READ_ERROR_BACKOFF_MS);
      }
    }
  }

  private async reclaimAbandonedEntriesIfDue(): Promise<void> {
    const now = Date.now();
    if (now < this.nextReclaimDueAt) {
      return;
    }
    this.nextReclaimDueAt = now + this.options.config.reclaimIntervalMs;

    const { streamName, consumerGroup, consumerName, reclaimIdleMs, batchSize, maxDeliveryAttempts } =
      this.options.config;

    const pending = parsePendingEntries(
      await this.call(
        'XPENDING',
        streamName,
        consumerGroup,
        'IDLE',
        String(reclaimIdleMs),
        '-',
        '+',
        String(batchSize),
      ),
    );
    if (pending.length === 0) {
      return;
    }

    const retryable = pending.filter((entry): boolean => entry.deliveryCount < maxDeliveryAttempts);
    const exhausted = pending.filter((entry): boolean => entry.deliveryCount >= maxDeliveryAttempts);

    if (retryable.length > 0) {
      const claimed = parseEntryList(
        await this.call(
          'XCLAIM',
          streamName,
          consumerGroup,
          consumerName,
          String(reclaimIdleMs),
          ...retryable.map((entry): string => entry.id),
        ),
      );
      await this.processEntries(claimed);
    }

    for (const item of exhausted) {
      const rows = parseEntryList(await this.call('XRANGE', streamName, item.id, item.id));
      const entry = rows[0];
      if (entry === undefined) {
        // The entry was trimmed from the stream; drop it from the PEL.
        await this.acknowledge(item.id);
        this.options.logger.warn('Pending entry no longer exists in the stream; acknowledged to clear the PEL', {
          streamEntryId: item.id,
        });
        continue;
      }
      await this.deadLetter(entry, item.deliveryCount);
    }

    this.options.logger.debug('Pending entries reclaimed', {
      reclaimed: retryable.length,
      deadLettered: exhausted.length,
    });
  }

  private async readNewEntries(): Promise<StreamEntry[]> {
    const { streamName, consumerGroup, consumerName, batchSize, blockMs } = this.options.config;
    const response = await this.call(
      'XREADGROUP',
      'GROUP',
      consumerGroup,
      consumerName,
      'COUNT',
      String(batchSize),
      'BLOCK',
      String(blockMs),
      'STREAMS',
      streamName,
      '>',
    );
    return parseXReadResponse(response);
  }

  private async processEntries(entries: readonly StreamEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.processEntry(entry);
    }
  }

  private async processEntry(entry: StreamEntry): Promise<void> {
    const startedAt = performance.now();
    try {
      await this.options.handler.handle(entry);
      await this.acknowledge(entry.id);
    } catch (error: unknown) {
      // No ack: the entry stays in the PEL and is retried after the idle threshold.
      this.options.metrics.recordEventProcessed(
        'failed',
        entry.fields['eventType'] ?? 'unknown',
        (performance.now() - startedAt) / 1000,
      );
      this.options.logger.warn('Event handler failed; entry stays pending for redelivery', {
        streamEntryId: entry.id,
        error: errorInfo(error),
      });
    }
  }

  private async deadLetter(entry: StreamEntry, deliveryAttempts: number): Promise<void> {
    const { streamName, consumerGroup, consumerName, maxDeliveryAttempts } = this.options.config;
    const input: DeadLetterInput = {
      streamName,
      consumerGroup,
      consumerName,
      redisEntryId: entry.id,
      eventId: entry.fields['eventId'] ?? null,
      eventType: entry.fields['eventType'] ?? null,
      aggregateId: entry.fields['aggregateId'] ?? null,
      payload: entry.fields['payload'] ?? '{}',
      errorType: 'MaxDeliveryAttemptsExceeded',
      errorMessage: `Entry ${entry.id} exceeded the maximum of ${maxDeliveryAttempts} delivery attempts`,
      deliveryAttempts,
    };
    try {
      await this.options.deadLetterStore.record(input);
      await this.acknowledge(entry.id);
      this.options.metrics.recordEventProcessed('dead_lettered', input.eventType ?? 'unknown', 0);
      this.options.logger.error('Stream entry moved to dead-letter storage', {
        streamEntryId: entry.id,
        eventId: input.eventId,
        eventType: input.eventType,
        deliveryAttempts,
      });
    } catch (error: unknown) {
      // Keep the entry pending so dead-lettering can be retried later.
      this.options.logger.error('Failed to persist dead letter; entry remains pending', {
        streamEntryId: entry.id,
        error: errorInfo(error),
      });
    }
  }

  private async acknowledge(streamEntryId: string): Promise<void> {
    const acked = await this.call(
      'XACK',
      this.options.config.streamName,
      this.options.config.consumerGroup,
      streamEntryId,
    );
    if (Number(acked) !== 1) {
      this.options.logger.warn('Stream entry was not acknowledged; it will be redelivered', { streamEntryId });
    }
  }

  private async recordStreamLength(): Promise<void> {
    const raw = await this.call('XLEN', this.options.config.streamName);
    const length = Number(raw);
    if (Number.isFinite(length)) {
      this.options.metrics.recordStreamLength(length);
    }
  }

  private async ensureGroupExists(): Promise<void> {
    const { streamName, consumerGroup } = this.options.config;
    try {
      await this.call('XGROUP', 'CREATE', streamName, consumerGroup, '0', 'MKSTREAM');
      this.options.logger.info('Created Redis consumer group', { streamName, consumerGroup });
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('BUSYGROUP')) {
        return;
      }
      throw error;
    }
  }

  private async call(command: string, ...args: string[]): Promise<unknown> {
    return this.options.redis.call(command, ...args);
  }
}

function isNoGroupError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('NOGROUP');
}
