import type { MetricsSnapshot } from './types';

export interface ParsedMetricSample {
  labels: Record<string, string>;
  value: number;
}

export type ParsedMetrics = Map<string, ParsedMetricSample[]>;

const SAMPLE_LINE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+(\S+)(?:\s+\d+)?$/;
const LABEL_PAIR = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g;

/**
 * Minimal Prometheus text-exposition parser — enough for the engine's own
 * series (counters, gauges, histogram sum/count) without pulling a client
 * library into the dashboard bundle.
 */
export function parsePrometheusText(text: string): ParsedMetrics {
  const metrics: ParsedMetrics = new Map();

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const match = SAMPLE_LINE.exec(line);
    if (match === null) {
      continue;
    }
    const name = match[1] ?? '';
    const value = Number(match[3] ?? '');
    if (name.length === 0 || !Number.isFinite(value)) {
      continue;
    }
    const sample: ParsedMetricSample = { labels: parseLabels(match[2] ?? ''), value };
    const series = metrics.get(name);
    if (series === undefined) {
      metrics.set(name, [sample]);
    } else {
      series.push(sample);
    }
  }

  return metrics;
}

function parseLabels(input: string): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const match of input.matchAll(LABEL_PAIR)) {
    const key = match[1];
    const rawValue = match[2];
    if (key !== undefined && rawValue !== undefined) {
      labels[key] = rawValue.replaceAll('\\"', '"').replaceAll('\\\\', '\\');
    }
  }
  return labels;
}

function sumOf(metrics: ParsedMetrics, name: string, predicate?: (labels: Record<string, string>) => boolean): number {
  const series = metrics.get(name);
  if (series === undefined) {
    return 0;
  }
  return series.reduce(
    (total, sample) => (predicate === undefined || predicate(sample.labels) ? total + sample.value : total),
    0,
  );
}

function firstValue(metrics: ParsedMetrics, name: string): number | null {
  const series = metrics.get(name);
  const sample = series?.[0];
  return sample === undefined ? null : sample.value;
}

/** Converts the raw exposition payload into the dashboard's normalized snapshot. */
export function buildSnapshot(text: string, fetchedAt: number): MetricsSnapshot {
  const metrics = parsePrometheusText(text);
  return {
    fetchedAt,
    processStartTimeSeconds: firstValue(metrics, 'event_engine_process_start_time_seconds'),
    streamLength: firstValue(metrics, 'event_engine_stream_length'),
    ingestTotal: sumOf(metrics, 'event_engine_events_ingested_total'),
    ingestByEventType: Object.fromEntries(
      (metrics.get('event_engine_events_ingested_total') ?? []).map((sample) => [
        sample.labels['eventType'] ?? 'unknown',
        sample.value,
      ]),
    ),
    processed: {
      processed: sumOf(metrics, 'event_engine_events_processed_total', (labels) => labels['status'] === 'processed'),
      failed: sumOf(metrics, 'event_engine_events_processed_total', (labels) => labels['status'] === 'failed'),
      deadLettered: sumOf(
        metrics,
        'event_engine_events_processed_total',
        (labels) => labels['status'] === 'dead_lettered',
      ),
    },
    ingestHttpPostTotal: sumOf(
      metrics,
      'event_engine_http_requests_total',
      (labels) => labels['method'] === 'POST' && labels['route'] === '/v1/events',
    ),
    httpRequestsTotal: sumOf(metrics, 'event_engine_http_requests_total'),
    ingestDuration: {
      count: sumOf(metrics, 'event_engine_ingest_duration_seconds_count'),
      sumSeconds: sumOf(metrics, 'event_engine_ingest_duration_seconds_sum'),
    },
    httpRequestDuration: {
      count: sumOf(metrics, 'event_engine_http_request_duration_seconds_count'),
      sumSeconds: sumOf(metrics, 'event_engine_http_request_duration_seconds_sum'),
    },
  };
}
