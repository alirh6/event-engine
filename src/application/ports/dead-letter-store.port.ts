/** Data captured when a stream entry is permanently abandoned. */
export interface DeadLetterInput {
  readonly streamName: string;
  readonly consumerGroup: string;
  readonly consumerName: string;
  readonly redisEntryId: string;
  readonly eventId: string | null;
  readonly eventType: string | null;
  readonly aggregateId: string | null;
  readonly payload: string;
  readonly errorType: string;
  readonly errorMessage: string;
  readonly deliveryAttempts: number;
}

/** Read model of a persisted dead letter, as surfaced to operations tooling. */
export interface DeadLetterEntry {
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
  readonly failedAt: Date;
}

export interface DeadLetterFilter {
  readonly page: number;
  readonly pageSize: number;
}

export interface PaginatedDeadLetters {
  readonly items: readonly DeadLetterEntry[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/** Storage for poison messages that exceeded their delivery budget. */
export interface DeadLetterStore {
  record(input: DeadLetterInput): Promise<void>;
  list(filter: DeadLetterFilter): Promise<PaginatedDeadLetters>;
  findById(id: string): Promise<DeadLetterEntry | null>;
  delete(id: string): Promise<void>;
}
