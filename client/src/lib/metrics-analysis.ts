import type { MetricsSnapshot } from './types';

export interface RateSeriesPoint {
  readonly t: number;
  readonly ingestPerSec: number;
  readonly processedPerSec: number;
  readonly deadLetteredPerSec: number;
}

export type ConsumerStatus = 'consuming' | 'idle' | 'stalled' | 'unknown';

const CONSUMING_THRESHOLD_PER_SEC = 0.01;

/**
 * Derives per-second rates from consecutive counter snapshots. Counter resets
 * (engine restart) produce negative deltas, which are clamped to zero.
 */
export function computeRateSeries(history: readonly MetricsSnapshot[]): RateSeriesPoint[] {
  const points: RateSeriesPoint[] = [];
  for (let index = 1; index < history.length; index += 1) {
    const previous = history[index - 1];
    const current = history[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    const dtSeconds = (current.fetchedAt - previous.fetchedAt) / 1000;
    if (dtSeconds <= 0) {
      continue;
    }
    const rate = (latest: number, earlier: number): number => Math.max(0, (latest - earlier) / dtSeconds);
    points.push({
      t: current.fetchedAt,
      ingestPerSec: rate(current.ingestHttpPostTotal, previous.ingestHttpPostTotal),
      processedPerSec: rate(current.processed.processed, previous.processed.processed),
      deadLetteredPerSec: rate(current.processed.deadLettered, previous.processed.deadLettered),
    });
  }
  return points;
}

function lastOf<T>(values: readonly T[]): T | undefined {
  return values[values.length - 1];
}

/**
 * Derives the stream consumer state from recent telemetry:
 * - processed rate > 0          → consuming
 * - backlog growing unprocessed → stalled
 * - otherwise                   → idle
 */
export function deriveConsumerStatus(
  history: readonly MetricsSnapshot[],
  rates: readonly RateSeriesPoint[],
): ConsumerStatus {
  const latest = lastOf(history);
  if (latest === undefined || latest.streamLength === null || rates.length === 0) {
    return 'unknown';
  }

  const window = rates.slice(-3);
  const processedRate = Math.max(...window.map((point) => point.processedPerSec));
  if (processedRate > CONSUMING_THRESHOLD_PER_SEC) {
    return 'consuming';
  }

  const oldest = history[Math.max(0, history.length - 4)];
  const current = lastOf(history);
  if (oldest !== undefined && current !== undefined && oldest.streamLength !== null && current.streamLength !== null) {
    if (current.streamLength > oldest.streamLength) {
      return 'stalled';
    }
  }
  return 'idle';
}

/** Windowed average in milliseconds; `null` when no completions were observed. */
export function windowedAverageMs(
  history: readonly MetricsSnapshot[],
  pick: (snapshot: MetricsSnapshot) => { count: number; sumSeconds: number },
): number | null {
  if (history.length < 2) {
    return null;
  }
  const first = history[0];
  const last = lastOf(history);
  if (first === undefined || last === undefined) {
    return null;
  }
  const deltaCount = pick(last).count - pick(first).count;
  const deltaSum = pick(last).sumSeconds - pick(first).sumSeconds;
  if (deltaCount <= 0) {
    return null;
  }
  return (deltaSum / deltaCount) * 1000;
}
