import type { DeadLetterStore } from '../ports/dead-letter-store.port.js';
import type { PagedDeadLettersResponseDto } from '../dtos/dead-letter.dtos.js';

/** Query carrying pagination parameters for the dead-letter audit trail. */
export interface ListDeadLettersQuery {
  readonly page: number;
  readonly pageSize: number;
}

/** Read-side use case: list dead-lettered stream entries, newest first. */
export class ListDeadLettersHandler {
  public constructor(private readonly deadLetters: DeadLetterStore) {}

  public async execute(query: ListDeadLettersQuery): Promise<PagedDeadLettersResponseDto> {
    const result = await this.deadLetters.list({
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: result.items.map((entry) => ({
        id: entry.id,
        streamName: entry.streamName,
        consumerGroup: entry.consumerGroup,
        consumerName: entry.consumerName,
        redisEntryId: entry.redisEntryId,
        eventId: entry.eventId,
        eventType: entry.eventType,
        aggregateId: entry.aggregateId,
        errorType: entry.errorType,
        errorMessage: entry.errorMessage,
        deliveryAttempts: entry.deliveryAttempts,
        failedAt: entry.failedAt.toISOString(),
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)),
    };
  }
}
