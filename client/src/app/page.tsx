'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, Radio } from 'lucide-react';

import { DashboardHeader } from '@/components/dashboard-header';
import { EventStreamTable } from '@/components/event-stream-table';
import { HealthCards } from '@/components/health-cards';
import { IngestionSimulator } from '@/components/ingestion-simulator';
import { MetricsPanel } from '@/components/metrics-panel';
import { usePoll } from '@/lib/use-poll';
import type { MetricsSnapshot, PagedDeadLettersDto, PagedEventsDto, SystemHealth, UnifiedEventRow } from '@/lib/types';

const HEALTH_INTERVAL_MS = 5_000;
const METRICS_INTERVAL_MS = 2_000;
const TABLE_INTERVAL_MS = 2_500;
const METRICS_HISTORY_LIMIT = 90;
const TABLE_ROW_LIMIT = 30;

function useNow(intervalMs: number): number {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return nowMs;
}

function useMetricsHistory(snapshot: MetricsSnapshot | null, limit: number): MetricsSnapshot[] {
  const [history, setHistory] = useState<MetricsSnapshot[]>([]);
  useEffect(() => {
    if (snapshot === null) {
      return;
    }
    setHistory((previous) => [...previous, snapshot].slice(-limit));
  }, [snapshot, limit]);
  return history;
}

/** Merges ingested events and dead letters into one live, newest-first feed. */
function buildUnifiedRows(events: PagedEventsDto | null, deadLetters: PagedDeadLettersDto | null): UnifiedEventRow[] {
  const rows: UnifiedEventRow[] = [];

  for (const event of events?.items ?? []) {
    rows.push({
      key: `event-${event.id}`,
      timestampMs: Date.parse(event.occurredAt),
      id: event.id,
      eventType: event.eventType,
      aggregate: `${event.aggregateType}:${event.aggregateId}`,
      status: 'success',
      detail: null,
    });
  }

  for (const entry of deadLetters?.items ?? []) {
    rows.push({
      key: `dlq-${entry.id}`,
      timestampMs: Date.parse(entry.failedAt),
      id: entry.eventId ?? entry.redisEntryId,
      eventType: entry.eventType ?? 'unknown event type',
      aggregate: entry.aggregateId ?? '—',
      status: 'dlq',
      detail: `${entry.errorType} · ${entry.deliveryAttempts} delivery attempts`,
    });
  }

  return rows
    .filter((row) => Number.isFinite(row.timestampMs))
    .sort((a, b) => b.timestampMs - a.timestampMs)
    .slice(0, TABLE_ROW_LIMIT);
}

export default function DashboardPage() {
  const [paused, setPaused] = useState<boolean>(false);
  const nowMs = useNow(1_000);

  const health = usePoll<SystemHealth>(paused ? null : '/api/health', HEALTH_INTERVAL_MS);
  const metrics = usePoll<MetricsSnapshot>(paused ? null : '/api/metrics', METRICS_INTERVAL_MS);
  const events = usePoll<PagedEventsDto>(paused ? null : '/api/events?page=1&pageSize=50', TABLE_INTERVAL_MS);
  const deadLetters = usePoll<PagedDeadLettersDto>(
    paused ? null : '/api/dead-letters?page=1&pageSize=50',
    TABLE_INTERVAL_MS,
  );

  const metricsHistory = useMetricsHistory(metrics.data, METRICS_HISTORY_LIMIT);
  const rows = useMemo(() => buildUnifiedRows(events.data, deadLetters.data), [events.data, deadLetters.data]);

  const tableError =
    events.error !== null && deadLetters.error !== null
      ? 'Event engine is unreachable — showing the last known state.'
      : (events.error ?? deadLetters.error);

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60rem_40rem_at_75%_-10%,rgba(56,189,248,0.07),transparent),radial-gradient(50rem_30rem_at_-10%_30%,rgba(52,211,153,0.05),transparent)]"
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <DashboardHeader
          paused={paused}
          onTogglePause={() => setPaused((value) => !value)}
          connected={health.data?.api.status === 'ok'}
          uptimeSeconds={health.data?.api.uptimeSeconds ?? null}
          lastUpdatedAt={metrics.lastUpdatedAt}
          nowMs={nowMs}
        />

        <section aria-label="System health" className="mt-6">
          <HealthCards health={health.data} loading={health.loading} />
        </section>

        <div className="mt-4">
          <MetricsPanel history={metricsHistory} error={metrics.error} />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <EventStreamTable
              rows={rows}
              loading={events.loading || deadLetters.loading}
              paused={paused}
              onTogglePause={() => setPaused((value) => !value)}
              error={tableError}
            />
          </div>
          <IngestionSimulator disabled={paused} />
        </div>

        <footer className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-edge pt-4 text-[11px] text-faint sm:flex-row">
          <span className="inline-flex items-center gap-1.5">
            <Radio className="h-3 w-3" aria-hidden />
            {paused ? 'Live updates paused' : `Live updates every ${(TABLE_INTERVAL_MS / 1000).toFixed(1)}s`}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Activity className="h-3 w-3" aria-hidden />
            telemetry proxied through /api/* · metrics from Prometheus exposition
          </span>
        </footer>
      </main>
    </div>
  );
}
