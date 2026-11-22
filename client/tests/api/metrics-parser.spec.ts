import { describe, expect, it } from 'vitest';

import { buildSnapshot, parsePrometheusText } from '@/lib/metrics-parser';

const SAMPLE = [
  '# HELP event_engine_events_ingested_total Total ingested.',
  '# TYPE event_engine_events_ingested_total counter',
  'event_engine_events_ingested_total{eventType="order.created"} 12',
  'event_engine_events_ingested_total{eventType="payment.settled"} 5',
  '# TYPE event_engine_events_processed_total counter',
  'event_engine_events_processed_total{status="processed",eventType="order.created"} 10',
  'event_engine_events_processed_total{status="failed",eventType="order.created"} 2',
  'event_engine_events_processed_total{status="dead_lettered",eventType="x"} 1',
  '# TYPE event_engine_http_requests_total counter',
  'event_engine_http_requests_total{method="POST",route="/v1/events",statusCode="201"} 17',
  'event_engine_http_requests_total{method="GET",route="/v1/events",statusCode="200"} 40',
  '# TYPE event_engine_stream_length gauge',
  'event_engine_stream_length 12345',
  '# TYPE event_engine_ingest_duration_seconds histogram',
  'event_engine_ingest_duration_seconds_bucket{le="0.1",eventType="order.created"} 15',
  'event_engine_ingest_duration_seconds_sum{eventType="order.created"} 0.42',
  'event_engine_ingest_duration_seconds_count{eventType="order.created"} 17',
  '# TYPE event_engine_process_start_time_seconds gauge',
  'event_engine_process_start_time_seconds 1700000000',
  '',
].join('\n');

describe('parsePrometheusText', (): void => {
  it('parses labelled samples and skips comments and blanks', (): void => {
    const metrics = parsePrometheusText(SAMPLE);

    expect(metrics.get('event_engine_stream_length')).toEqual([{ labels: {}, value: 12345 }]);
    expect(metrics.get('event_engine_events_ingested_total')).toHaveLength(2);
  });

  it('returns an empty map for empty or malformed payloads', (): void => {
    expect(parsePrometheusText('')).toEqual(new Map());
    expect(parsePrometheusText('not a metric line')).toEqual(new Map());
    expect(parsePrometheusText('# only a comment')).toEqual(new Map());
  });
});

describe('buildSnapshot', (): void => {
  it('normalizes the engine exposition into the dashboard snapshot', (): void => {
    const snapshot = buildSnapshot(SAMPLE, 1_000);

    expect(snapshot.fetchedAt).toBe(1_000);
    expect(snapshot.ingestTotal).toBe(17);
    expect(snapshot.ingestByEventType).toEqual({ 'order.created': 12, 'payment.settled': 5 });
    expect(snapshot.processed).toEqual({ processed: 10, failed: 2, deadLettered: 1 });
    expect(snapshot.ingestHttpPostTotal).toBe(17);
    expect(snapshot.httpRequestsTotal).toBe(57);
    expect(snapshot.streamLength).toBe(12_345);
    expect(snapshot.ingestDuration).toEqual({ count: 17, sumSeconds: 0.42 });
    expect(snapshot.processStartTimeSeconds).toBe(1_700_000_000);
  });

  it('yields zeroed counters for an empty exposition instead of NaN', (): void => {
    const snapshot = buildSnapshot('', 1);

    expect(snapshot.ingestTotal).toBe(0);
    expect(snapshot.streamLength).toBeNull();
    expect(snapshot.ingestHttpPostTotal).toBe(0);
  });
});
