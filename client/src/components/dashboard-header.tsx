'use client';

import { Activity, Pause, Play, Zap } from 'lucide-react';

import { Badge, StatusDot } from '@/components/primitives';
import { formatDuration, formatRelative } from '@/lib/format';

interface DashboardHeaderProps {
  readonly paused: boolean;
  readonly onTogglePause: () => void;
  readonly connected: boolean;
  readonly uptimeSeconds: number | null;
  readonly lastUpdatedAt: number | null;
  readonly nowMs: number;
}

export function DashboardHeader({
  paused,
  onTogglePause,
  connected,
  uptimeSeconds,
  lastUpdatedAt,
  nowMs,
}: DashboardHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
          <Zap className="h-5 w-5 text-accent" aria-hidden />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">Event Engine</h1>
          <p className="text-xs text-muted">Distributed event processing · operations console</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={connected ? 'ok' : 'danger'}>
          <StatusDot tone={connected ? 'ok' : 'danger'} pulse={connected} />
          {connected ? 'Connected' : 'Engine offline'}
        </Badge>
        <Badge tone="neutral">
          <Activity className="h-3 w-3" aria-hidden />
          uptime {formatDuration(uptimeSeconds)}
        </Badge>
        <Badge tone="neutral">updated {formatRelative(lastUpdatedAt, nowMs)}</Badge>
        <button
          type="button"
          onClick={onTogglePause}
          className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-panel px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-edge-strong hover:text-ink"
          aria-pressed={paused}
        >
          {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
          {paused ? 'Resume live' : 'Pause live'}
        </button>
      </div>
    </header>
  );
}
