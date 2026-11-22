/** Normalized types shared between the BFF routes and dashboard components. */

export interface SystemHealth {
  api: { status: 'ok' | 'unreachable'; uptimeSeconds: number | null };
  postgres: { status: 'ok' | 'failing' | 'unreachable'; detail: string };
  redis: { status: 'ok' | 'failing' | 'unreachable'; detail: string };
  fetchedAt: number;
}

export interface MetricsSnapshot {
  fetchedAt: number;
  processStartTimeSeconds: number | null;
  streamLength: number | null;
  ingestTotal: number;
  ingestByEventType: Record<string, number>;
  processed: { processed: number; failed: number; deadLettered: number };
  ingestHttpPostTotal: number;
  httpRequestsTotal: number;
  ingestDuration: { count: number; sumSeconds: number };
  httpRequestDuration: { count: number; sumSeconds: number };
}

export interface EventRowDto {
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

export interface PagedEventsDto {
  readonly items: readonly EventRowDto[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface DeadLetterRowDto {
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

export interface PagedDeadLettersDto {
  readonly items: readonly DeadLetterRowDto[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface UnifiedEventRow {
  readonly key: string;
  readonly timestampMs: number;
  readonly id: string;
  readonly eventType: string;
  readonly aggregate: string;
  readonly status: 'success' | 'dlq';
  readonly detail: string | null;
}
