import { z } from 'zod';

/** Query schema for `GET /v1/dead-letters`. */
export const ListDeadLettersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Path schema for `POST /v1/dead-letters/:id/replay`. */
export const DeadLetterIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export interface ReplayDeadLetterResponseDto {
  readonly replayed: true;
  readonly deadLetterId: string;
  readonly eventId: string;
}

export interface DeadLetterResponseDto {
  readonly id: string;
  readonly streamName: string;
  readonly consumerGroup: string;
  readonly consumerName: string;
  readonly redisEntryId: string;
  readonly eventId: string | null;
  readonly eventType: string | null;
  readonly aggregateId: string | null;
  readonly errorType: string;
  readonly errorMessage: string;
  readonly deliveryAttempts: number;
  readonly failedAt: string;
}

export interface PagedDeadLettersResponseDto {
  readonly items: readonly DeadLetterResponseDto[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}
