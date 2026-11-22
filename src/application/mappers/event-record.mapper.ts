import type { EventResponseDto } from '../dtos/event.dtos.js';
import type { EventRecord } from '../../domain/entities/event-record.aggregate.js';

/** Maps domain aggregates to their API-facing DTO representation. */
export class EventRecordMapper {
  public static toResponse(record: EventRecord): EventResponseDto {
    return {
      id: record.id.value,
      eventType: record.eventType.value,
      aggregateType: record.aggregateType,
      aggregateId: record.aggregateId,
      version: record.version,
      payload: record.payload.value,
      metadata: record.metadata.toJSON(),
      occurredAt: record.occurredAt.toISOString(),
      sequence: record.sequence === null ? null : record.sequence.toString(),
    };
  }

  public static toPagedResponse(
    items: readonly EventRecord[],
    total: number,
    page: number,
    pageSize: number,
  ): {
    readonly items: readonly EventResponseDto[];
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly totalPages: number;
  } {
    return {
      items: items.map((record) => EventRecordMapper.toResponse(record)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }
}
