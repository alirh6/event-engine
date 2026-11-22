import type { EventRecordRepository } from '../../domain/repositories/event-record.repository.js';
import { EventRecordMapper } from '../mappers/event-record.mapper.js';
import type { PagedEventsResponseDto } from '../dtos/event.dtos.js';

/** Query carrying pagination and filtering parameters. */
export interface ListEventsQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly eventType: string | null;
}

/** Read-side use case: list event records, newest first. */
export class ListEventsHandler {
  public constructor(private readonly eventStore: EventRecordRepository) {}

  public async execute(query: ListEventsQuery): Promise<PagedEventsResponseDto> {
    const result = await this.eventStore.listPaginated({
      page: query.page,
      pageSize: query.pageSize,
      eventType: query.eventType,
    });
    return EventRecordMapper.toPagedResponse(result.items, result.total, result.page, result.pageSize);
  }
}
