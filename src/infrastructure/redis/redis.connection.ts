import { Redis } from 'ioredis';

import type { LoggerPort } from '../../application/ports/logger.port.js';
import { errorInfo } from '../../shared/errors.js';

/**
 * Owns the ioredis client lifecycle. `maxRetriesPerRequest: null` is
 * mandatory so blocking commands (XREADGROUP … BLOCK) survive reconnects.
 */
export class RedisConnection {
  private readonly client: Redis;

  public constructor(url: string, logger: LoggerPort) {
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      connectTimeout: 10_000,
      enableOfflineQueue: true,
      retryStrategy: (retryCount: number): number => Math.min(retryCount * 500, 10_000),
    });

    this.client.on('error', (error: Error): void => {
      logger.error('Redis client error', errorInfo(error));
    });
    this.client.on('reconnecting', (delay: number): void => {
      logger.warn('Redis client reconnecting', { delayMs: delay });
    });
    this.client.on('connect', (): void => {
      logger.info('Redis client connected');
    });
  }

  /** The raw client, shared with the stream publisher and consumer. */
  public get raw(): Redis {
    return this.client;
  }

  public async connect(): Promise<void> {
    await this.client.connect();
  }

  public async disconnect(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }
    try {
      await this.client.quit();
    } catch {
      // Socket already gone — force-close instead of hanging on QUIT.
      this.client.disconnect();
    }
  }
}
