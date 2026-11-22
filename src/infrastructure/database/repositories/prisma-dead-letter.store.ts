import type { DeadLetterEvent as DeadLetterEventRow, Prisma, PrismaClient } from '@prisma/client';

import type {
  DeadLetterEntry,
  DeadLetterFilter,
  DeadLetterInput,
  DeadLetterStore,
  PaginatedDeadLetters,
} from '../../../application/ports/dead-letter-store.port.js';

/** Persists poison messages to PostgreSQL for durable audit and later replay. */
export class PrismaDeadLetterStore implements DeadLetterStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async record(input: DeadLetterInput): Promise<void> {
    await this.prisma.deadLetterEvent.create({
      data: {
        streamName: input.streamName,
        consumerGroup: input.consumerGroup,
        consumerName: input.consumerName,
        redisEntryId: input.redisEntryId,
        eventId: input.eventId,
        eventType: input.eventType,
        aggregateId: input.aggregateId,
        payload: toPrismaJson(input.payload),
        errorType: input.errorType,
        errorMessage: input.errorMessage.slice(0, 4000),
        deliveryAttempts: input.deliveryAttempts,
      },
    });
  }

  public async list(filter: DeadLetterFilter): Promise<PaginatedDeadLetters> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.deadLetterEvent.findMany({
        orderBy: { failedAt: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.deadLetterEvent.count(),
    ]);
    return {
      items: rows.map((row) => toEntry(row)),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  public async findById(id: string): Promise<DeadLetterEntry | null> {
    const row = await this.prisma.deadLetterEvent.findUnique({ where: { id } });
    return row === null ? null : toEntry(row);
  }

  public async delete(id: string): Promise<void> {
    await this.prisma.deadLetterEvent.delete({ where: { id } });
  }
}

function toEntry(row: DeadLetterEventRow): DeadLetterEntry {
  return {
    id: row.id,
    streamName: row.streamName,
    consumerGroup: row.consumerGroup,
    consumerName: row.consumerName,
    redisEntryId: row.redisEntryId,
    eventId: row.eventId,
    eventType: row.eventType,
    aggregateId: row.aggregateId,
    errorType: row.errorType,
    errorMessage: row.errorMessage,
    deliveryAttempts: row.deliveryAttempts,
    failedAt: row.failedAt,
  };
}

function toPrismaJson(raw: string): Prisma.InputJsonValue {
  try {
    return JSON.parse(raw) as Prisma.InputJsonValue;
  } catch {
    // Preserve unparseable payloads verbatim instead of losing them.
    return { raw };
  }
}
