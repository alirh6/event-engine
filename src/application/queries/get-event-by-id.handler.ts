import { EventId } from '../../domain/value-objects/event-id.vo.js';
import { EventRecordNotFoundError } from '../../domain/errors/event-record.errors.js';
import type { EventRecordRepository } from '../../domain/repositories/event-record.repository.js';
import { EventRecordMapper } from '../mappers/event-record.mapper.js';
import type { EventResponseDto } from '../dtos/event.dtos.js';

/** Query carrying the id of the event to load. */
export interface GetEventByIdQuery {
  readonly id: string;
}

/** Read-side use case: fetch a single event record by id. */
export class GetEventByIdHandler {
  public constructor(private readonly eventStore: EventRecordRepository) {}

  public async execute(query: GetEventByIdQuery): Promise<EventResponseDto> {
    const eventId = EventId.from(query.id);
    const record = await this.eventStore.findById(eventId);
    if (record === null) {
      throw new EventRecordNotFoundError(query.id);
    }
    return EventRecordMapper.toResponse(record);
  }
}
