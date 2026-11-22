import type { EventRecord as EventRecordRow, Prisma } from '@prisma/client';

import { EventRecord } from '../../../domain/entities/event-record.aggregate.js';
import { AggregateId } from '../../../domain/value-objects/aggregate-id.vo.js';
import { EventId } from '../../../domain/value-objects/event-id.vo.js';
import { EventMetadata, type EventMetadataInput } from '../../../domain/value-objects/event-metadata.vo.js';
import { EventPayload } from '../../../domain/value-objects/event-payload.vo.js';
import { EventType } from '../../../domain/value-objects/event-type.vo.js';

/** Bidirectional mapping between the Prisma `events` row and the domain aggregate. */
export class EventRecordPrismaMapper {
  public static toDomain(row: EventRecordRow): EventRecord {
    return EventRecord.rehydrate({
      id: EventId.from(row.id),
      eventType: EventType.from(row.eventType),
      aggregate: AggregateId.from(row.aggregateType, row.aggregateId),
      payload: EventPayload.from(row.payload),
      metadata: EventMetadata.from(toMetadataInput(row.metadata)),
      version: row.version,
      occurredAt: row.occurredAt,
      sequence: row.sequence,
    });
  }

  public static toPersistence(record: EventRecord): Prisma.EventRecordUncheckedCreateInput {
    return {
      id: record.id.value,
      aggregateType: record.aggregateType,
      aggregateId: record.aggregateId,
      eventType: record.eventType.value,
      // Payload values originate from a zod-validated JSON body, so they are
      // JSON-serializable by construction.
      payload: record.payload.value as unknown as Prisma.InputJsonValue,
      metadata: record.metadata.toJSON() as unknown as Prisma.InputJsonValue,
      version: record.version,
      occurredAt: record.occurredAt,
    };
  }
}

function toMetadataInput(raw: Prisma.JsonValue | null): EventMetadataInput | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const input: EventMetadataInput = {};

  const correlationId = record['correlationId'];
  if (typeof correlationId === 'string') {
    input.correlationId = correlationId;
  }
  const causationId = record['causationId'];
  if (typeof causationId === 'string') {
    input.causationId = causationId;
  }
  const source = record['source'];
  if (typeof source === 'string') {
    input.source = source;
  }
  const attributes = record['attributes'];
  if (typeof attributes === 'object' && attributes !== null && !Array.isArray(attributes)) {
    input.attributes = attributes as Record<string, unknown>;
  }
  return input;
}
