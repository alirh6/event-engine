import type { EventRecord as EventRecordRow, Prisma, PrismaClient } from '@prisma/client';

import type { EventRecord } from '../../../domain/entities/event-record.aggregate.js';
import {
  EventRecordAlreadyExistsError,
  EventVersionConflictError,
} from '../../../domain/errors/event-record.errors.js';
import type { DomainError } from '../../../domain/errors/domain-error.js';
import type {
  EventRecordFilter,
  EventRecordRepository,
  PaginatedResult,
} from '../../../domain/repositories/event-record.repository.js';
import type { AggregateId } from '../../../domain/value-objects/aggregate-id.vo.js';
import type { EventId } from '../../../domain/value-objects/event-id.vo.js';
import { EventRecordPrismaMapper } from '../mappers/event-record.prisma-mapper.js';

/** Prisma-backed implementation of the event store port. */
export class PrismaEventRecordRepository implements EventRecordRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async append(record: EventRecord): Promise<void> {
    let created: EventRecordRow;
    try {
      created = await this.prisma.eventRecord.create({ data: EventRecordPrismaMapper.toPersistence(record) });
    } catch (error: unknown) {
      if (isUniqueConstraintViolation(error)) {
        throw mapUniqueViolation(extractUniqueTarget(error), record);
      }
      throw error;
    }
    record.attachSequence(created.sequence);
  }

  public async findById(id: EventId): Promise<EventRecord | null> {
    const row = await this.prisma.eventRecord.findUnique({ where: { id: id.value } });
    return row === null ? null : EventRecordPrismaMapper.toDomain(row);
  }

  public async findByAggregate(aggregate: AggregateId): Promise<readonly EventRecord[]> {
    const rows = await this.prisma.eventRecord.findMany({
      where: { aggregateType: aggregate.aggregateType, aggregateId: aggregate.id },
      orderBy: { version: 'asc' },
    });
    return rows.map((row) => EventRecordPrismaMapper.toDomain(row));
  }

  public async listPaginated(filter: EventRecordFilter): Promise<PaginatedResult<EventRecord>> {
    const where: Prisma.EventRecordWhereInput = filter.eventType === null ? {} : { eventType: filter.eventType };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.eventRecord.findMany({
        where,
        orderBy: { sequence: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.eventRecord.count({ where }),
    ]);
    return {
      items: rows.map((row) => EventRecordPrismaMapper.toDomain(row)),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }
}

/**
 * Detects Prisma P2002 (unique constraint violation) structurally instead of
 * via `instanceof Prisma.PrismaClientKnownRequestError`, which stays correct
 * across Prisma versions and keeps the import type-only.
 */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code: string }).code === 'P2002'
  );
}

function mapUniqueViolation(target: string[], record: EventRecord): DomainError {
  if (target.includes('version')) {
    return new EventVersionConflictError(`${record.aggregateType}/${record.aggregateId} v${record.version}`);
  }
  return new EventRecordAlreadyExistsError(record.id.value);
}

function extractUniqueTarget(error: unknown): string[] {
  if (typeof error !== 'object' || error === null) {
    return [];
  }
  const meta: unknown = (error as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null) {
    return [];
  }
  const target: unknown = (meta as { target?: unknown }).target;
  return Array.isArray(target) ? target.map((field): string => String(field)) : [];
}
