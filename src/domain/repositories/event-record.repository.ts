import type { EventRecord } from '../entities/event-record.aggregate.js';
import type { AggregateId } from '../value-objects/aggregate-id.vo.js';
import type { EventId } from '../value-objects/event-id.vo.js';

/** Filter for paginated event listing. */
export interface EventRecordFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly eventType: string | null;
}

export interface PaginatedResult<TItem> {
  readonly items: readonly TItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Persistence port for the event store. The application layer depends on
 * this abstraction only; concrete implementations live in infrastructure.
 */
export interface EventRecordRepository {
  append(record: EventRecord): Promise<void>;
  findById(id: EventId): Promise<EventRecord | null>;
  findByAggregate(aggregate: AggregateId): Promise<readonly EventRecord[]>;
  listPaginated(filter: EventRecordFilter): Promise<PaginatedResult<EventRecord>>;
}
