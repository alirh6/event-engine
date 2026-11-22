import { z } from 'zod';

import { AGGREGATE_TYPE_PATTERN, EVENT_TYPE_PATTERN } from '../../domain/shared/patterns.js';

/** Request schema for `POST /v1/events`. */
export const IngestEventSchema = z.object({
  eventId: z.string().uuid().optional(),
  eventType: z
    .string()
    .min(3)
    .max(128)
    .regex(EVENT_TYPE_PATTERN, "eventType must be a lowercase dot/underscore separated token such as 'order.created'"),
  aggregateType: z
    .string()
    .min(2)
    .max(64)
    .regex(AGGREGATE_TYPE_PATTERN, "aggregateType must be kebab-case such as 'order'"),
  aggregateId: z.string().min(1).max(128),
  payload: z.record(z.unknown()).refine((payload): boolean => Object.keys(payload).length > 0, {
    message: 'payload must be a non-empty JSON object',
  }),
  metadata: z
    .object({
      correlationId: z.string().uuid().optional(),
      causationId: z.string().uuid().optional(),
      source: z.string().min(1).max(256).optional(),
      attributes: z.record(z.unknown()).optional(),
    })
    .optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
});

export type IngestEventDto = z.infer<typeof IngestEventSchema>;

/** Path schema for `GET /v1/events/:id`. */
export const EventIdParamsSchema = z.object({
  id: z.string().uuid(),
});

/** Query schema for `GET /v1/events`. */
export const ListEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  eventType: z.string().regex(EVENT_TYPE_PATTERN).optional(),
});

export interface EventResponseDto {
  readonly id: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly version: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
  readonly sequence: string | null;
}

export interface PagedEventsResponseDto {
  readonly items: readonly EventResponseDto[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}
