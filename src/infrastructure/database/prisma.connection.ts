import { PrismaClient } from '@prisma/client';

import type { Env } from '../config/env.config.js';

/** Owns the Prisma client lifecycle: connect on boot, disconnect on shutdown. */
export class PrismaConnection {
  private readonly _client: PrismaClient;

  public constructor(env: Env) {
    this._client = new PrismaClient({
      log: env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
    });
  }

  public get client(): PrismaClient {
    return this._client;
  }

  public async connect(): Promise<void> {
    await this._client.$connect();
  }

  public async disconnect(): Promise<void> {
    await this._client.$disconnect();
  }
}
