'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity, Inbox, Pause, Play, RefreshCw } from 'lucide-react';

import { Badge, Panel, Skeleton, StatusDot } from '@/components/primitives';
import { formatClock, shortId } from '@/lib/format';
import type { UnifiedEventRow } from '@/lib/types';

interface EventStreamTableProps {
  readonly rows: readonly UnifiedEventRow[];
  readonly loading: boolean;
  readonly paused: boolean;
  readonly onTogglePause: () => void;
  readonly error: string | null;
}

export function EventStreamTable({ rows, loading, paused, onTogglePause, error }: EventStreamTableProps) {
  const seenKeys = useRef<Set<string>>(new Set());
  const [freshKeys, setFreshKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fresh = new Set<string>();
    for (const row of rows) {
      if (!seenKeys.current.has(row.key)) {
        fresh.add(row.key);
        seenKeys.current.add(row.key);
      }
    }
    if (fresh.size > 0) {
      setFreshKeys(fresh);
      const timer = window.setTimeout(() => setFreshKeys(new Set()), 1500);
      return () => window.clearTimeout(timer);
    }
  }, [rows]);

  return (
    <Panel
      title="Event Stream"
      icon={Activity}
      bodyClassName=""
      actions={
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{rows.length} shown</Badge>
          <button
            type="button"
            onClick={onTogglePause}
            className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-panel-elevated px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:border-edge-strong hover:text-ink"
            aria-pressed={paused}
          >
            {paused ? <Play className="h-3 w-3" aria-hidden /> : <Pause className="h-3 w-3" aria-hidden />}
            {paused ? 'Resume' : 'Live'}
          </button>
        </div>
      }
    >
      {error !== null ? (
        <p className="border-b border-danger/30 bg-danger/10 px-4 py-2 text-xs text-danger">{error}</p>
      ) : null}

      {loading && rows.length === 0 ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-9" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
          <Inbox className="h-8 w-8 text-faint" aria-hidden />
          <p className="text-sm text-muted">No events yet</p>
          <p className="text-xs text-faint">Send one from the ingestion simulator to see it appear here.</p>
        </div>
      ) : (
        <div className="max-h-[430px] overflow-auto">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-panel">
              <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
                <th className="px-4 py-2 font-semibold">Time</th>
                <th className="px-4 py-2 font-semibold">Event</th>
                <th className="hidden px-4 py-2 font-semibold md:table-cell">Aggregate</th>
                <th className="hidden px-4 py-2 font-semibold sm:table-cell">ID</th>
                <th className="px-4 py-2 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className={`border-t border-edge/60 transition-colors hover:bg-panel-elevated/60 ${
                    freshKeys.has(row.key) ? 'animate-row-flash' : ''
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs tabular-nums text-muted">
                    {formatClock(row.timestampMs)}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-mono text-xs text-ink">{row.eventType}</p>
                    {row.detail !== null ? (
                      <p className="mt-0.5 max-w-[26rem] truncate text-[11px] text-danger/90" title={row.detail}>
                        {row.detail}
                      </p>
                    ) : null}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted md:table-cell">
                    {row.aggregate}
                  </td>
                  <td
                    className="hidden whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted sm:table-cell"
                    title={row.id}
                  >
                    {shortId(row.id)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    {row.status === 'success' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ok">
                        <StatusDot tone="ok" />
                        Success
                      </span>
                    ) : (
                      <Badge tone="danger">DLQ</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="flex items-center justify-between border-t border-edge px-4 py-2 text-[11px] text-faint">
        <span className="inline-flex items-center gap-1.5">
          <RefreshCw className={`h-3 w-3 ${paused ? '' : 'animate-spin text-faint'}`} aria-hidden />
          {paused ? 'live view paused' : 'polling every 2.5s'}
        </span>
        <span>merged view: ingested events + dead letters</span>
      </footer>
    </Panel>
  );
}
