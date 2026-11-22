export type EventProcessingStatus = 'processed' | 'failed' | 'dead_lettered';

/**
 * Metrics port consumed by application use cases and the stream consumer.
 * The concrete implementation exports Prometheus-compatible series.
 */
export interface MetricsPort {
  recordEventIngested(eventType: string): void;
  recordIngestDuration(eventType: string, durationSeconds: number): void;
  recordEventProcessed(status: EventProcessingStatus, eventType: string, durationSeconds: number): void;
  recordStreamLength(length: number): void;
  recordHttpRequest(method: string, route: string, statusCode: number, durationSeconds: number): void;
}
