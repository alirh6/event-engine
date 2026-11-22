'use client';

import { Gauge, TriangleAlert } from 'lucide-react';

import { Sparkline } from '@/components/sparkline';
import { Badge, type Tone } from '@/components/primitives';
import { formatMs, formatNumber } from '@/lib/format';
import {
  computeRateSeries,
  deriveConsumerStatus,
  windowedAverageMs,
  type ConsumerStatus,
} from '@/lib/metrics-analysis';
import type { MetricsSnapshot } from '@/lib/types';

const ACCENT = '#38bdf8';
const OK = '#34d399';
const DANGER = '#f87171';

const CONSUMER_LABEL: Record<ConsumerStatus, { text: string; tone: Tone }> = {
  consuming: { text: 'Consuming', tone: 'ok' },
  idle: { text: 'Idle', tone: 'neutral' },
  stalled: { text: 'Stalled', tone: 'warn' },
  unknown: { text: 'Unknown', tone: 'neutral' },
};

function lastOf<T>(values: readonly T[]): T | undefined {
  return values[values.length - 1];
}

function KpiCard({
  label,
  value,
  unit,
  footer,
  spark,
  sparkColor,
  badge,
}: {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly footer?: string;
  readonly spark?: readonly number[];
  readonly sparkColor?: string;
  readonly badge?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-edge bg-panel p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
        {badge}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-semibold tabular-nums text-ink">{value}</span>
        {unit ? <span className="text-xs text-muted">{unit}</span> : null}
      </div>
      {spark !== undefined ? (
        <div className="mt-2">
          <Sparkline values={spark} stroke={sparkColor ?? ACCENT} />
        </div>
      ) : null}
      {footer ? <p className="mt-2 truncate text-[11px] text-muted">{footer}</p> : null}
    </div>
  );
}

export function MetricsPanel({
  history,
  error,
}: {
  readonly history: readonly MetricsSnapshot[];
  readonly error: string | null;
}) {
  const rates = computeRateSeries(history);
  const latestIngestRate = lastOf(rates)?.ingestPerSec ?? 0;
  const latestProcessedRate = lastOf(rates)?.processedPerSec ?? 0;
  const latest = lastOf(history);
  const consumerStatus = deriveConsumerStatus(history, rates);
  const consumer = CONSUMER_LABEL[consumerStatus];
  const ingestLatencyMs = windowedAverageMs(history, (snapshot) => snapshot.ingestDuration);

  const deadLetteredTotal = latest?.processed.deadLettered ?? 0;
  const failedTotal = latest?.processed.failed ?? 0;
  const streamLength = latest?.streamLength ?? null;

  const previousStreamLength = history.length >= 2 ? (history[history.length - 2]?.streamLength ?? null) : null;
  const streamDelta =
    streamLength !== null && previousStreamLength !== null ? streamLength - previousStreamLength : null;

  return (
    <section aria-label="Throughput metrics">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Ingest throughput"
          value={latestIngestRate.toFixed(2)}
          unit="req/s"
          spark={rates.map((point) => point.ingestPerSec)}
          sparkColor={ACCENT}
          footer={`total ${formatNumber(latest?.ingestHttpPostTotal ?? 0)} ingests`}
        />
        <KpiCard
          label="Processed"
          value={latestProcessedRate.toFixed(2)}
          unit="events/s"
          spark={rates.map((point) => point.processedPerSec)}
          sparkColor={OK}
          footer={`total ${formatNumber(latest?.processed.processed ?? 0)} processed`}
        />
        <KpiCard
          label="Stream length"
          value={formatNumber(streamLength)}
          footer={
            streamDelta === null
              ? 'Redis stream backlog'
              : streamDelta > 0
                ? `+${formatNumber(streamDelta)} since last poll`
                : streamDelta < 0
                  ? `${formatNumber(streamDelta)} since last poll`
                  : 'stable since last poll'
          }
        />
        <KpiCard
          label="Dead-lettered"
          value={formatNumber(deadLetteredTotal)}
          spark={rates.map((point) => point.deadLetteredPerSec)}
          sparkColor={DANGER}
          badge={
            deadLetteredTotal > 0 ? (
              <Badge tone="danger">
                <TriangleAlert className="h-3 w-3" aria-hidden />
                alert
              </Badge>
            ) : null
          }
          footer={`${formatNumber(failedTotal)} failed attempts recorded`}
        />
        <KpiCard label="Ingest latency" value={formatMs(ingestLatencyMs)} footer="avg over the polling window" />
        <KpiCard
          label="Consumer"
          value={consumer.text}
          badge={<Badge tone={consumer.tone}>{consumer.text}</Badge>}
          footer={
            latest === undefined
              ? 'waiting for metrics…'
              : `http ${formatNumber(latest.httpRequestsTotal)} req · failed ${formatNumber(failedTotal)}`
          }
        />
      </div>
      {error !== null ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <Gauge className="h-3.5 w-3.5" aria-hidden />
          Metrics unavailable — {error}
        </p>
      ) : null}
    </section>
  );
}
