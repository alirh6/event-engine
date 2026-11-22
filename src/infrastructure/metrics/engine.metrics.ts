import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

import type { EventProcessingStatus, MetricsPort } from '../../application/ports/metrics.port.js';

/**
 * Prometheus metrics registry implementing the application `MetricsPort`.
 * Every series is prefixed with `event_engine_` to keep the namespace clean.
 */
export class EngineMetrics implements MetricsPort {
  public readonly registry = new Registry();

  private readonly stopDefaultMetrics: () => void;
  private readonly eventsIngestedTotal: Counter<string>;
  private readonly ingestDurationSeconds: Histogram<string>;
  private readonly eventsProcessedTotal: Counter<string>;
  private readonly processingDurationSeconds: Histogram<string>;
  private readonly httpRequestsTotal: Counter<string>;
  private readonly httpRequestDurationSeconds: Histogram<string>;
  private readonly streamLength: Gauge<string>;

  public constructor() {
    // collectDefaultMetrics returns its stop function at runtime; guard the
    // call so a future prom-client type change cannot crash shutdown.
    const maybeStop: unknown = collectDefaultMetrics({
      register: this.registry,
      prefix: 'event_engine_',
    });
    this.stopDefaultMetrics = typeof maybeStop === 'function' ? (maybeStop as () => void) : (): void => undefined;

    this.eventsIngestedTotal = new Counter<string>({
      name: 'event_engine_events_ingested_total',
      help: 'Total number of events accepted through the ingestion use case.',
      labelNames: ['eventType'],
      registers: [this.registry],
    });

    this.ingestDurationSeconds = new Histogram<string>({
      name: 'event_engine_ingest_duration_seconds',
      help: 'Latency of the ingestion use case (store append + stream publish).',
      labelNames: ['eventType'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.eventsProcessedTotal = new Counter<string>({
      name: 'event_engine_events_processed_total',
      help: 'Stream consumption outcomes by status.',
      labelNames: ['status', 'eventType'],
      registers: [this.registry],
    });

    this.processingDurationSeconds = new Histogram<string>({
      name: 'event_engine_processing_duration_seconds',
      help: 'Latency of successful stream event processing.',
      labelNames: ['eventType'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.httpRequestsTotal = new Counter<string>({
      name: 'event_engine_http_requests_total',
      help: 'HTTP requests served by the engine.',
      labelNames: ['method', 'route', 'statusCode'],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram<string>({
      name: 'event_engine_http_request_duration_seconds',
      help: 'HTTP request latency.',
      labelNames: ['method', 'route'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.streamLength = new Gauge<string>({
      name: 'event_engine_stream_length',
      help: 'Current number of entries in the Redis event stream.',
      registers: [this.registry],
    });
  }

  public recordEventIngested(eventType: string): void {
    this.eventsIngestedTotal.inc({ eventType });
  }

  public recordIngestDuration(eventType: string, durationSeconds: number): void {
    this.ingestDurationSeconds.observe({ eventType }, durationSeconds);
  }

  public recordEventProcessed(status: EventProcessingStatus, eventType: string, durationSeconds: number): void {
    this.eventsProcessedTotal.inc({ status, eventType });
    if (status === 'processed') {
      this.processingDurationSeconds.observe({ eventType }, durationSeconds);
    }
  }

  public recordStreamLength(length: number): void {
    this.streamLength.set(length);
  }

  public recordHttpRequest(method: string, route: string, statusCode: number, durationSeconds: number): void {
    this.httpRequestsTotal.inc({ method, route, statusCode });
    this.httpRequestDurationSeconds.observe({ method, route }, durationSeconds);
  }

  /** Stops the prom-client default metrics collection timer. */
  public stop(): void {
    this.stopDefaultMetrics();
  }
}
