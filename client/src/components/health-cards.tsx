'use client';

import { Database, MemoryStick, Server, type LucideIcon } from 'lucide-react';

import { Skeleton, StatusDot } from '@/components/primitives';
import { formatDuration } from '@/lib/format';
import type { SystemHealth } from '@/lib/types';

type CheckState = 'ok' | 'failing' | 'unreachable';

interface HealthCardModel {
  readonly key: string;
  readonly name: string;
  readonly icon: LucideIcon;
  readonly state: CheckState;
  readonly headline: string;
  readonly detail: string;
}

const STATE_LABEL: Record<CheckState, string> = {
  ok: 'Healthy',
  failing: 'Failing',
  unreachable: 'Offline',
};

function HealthCard({ model }: { model: HealthCardModel }) {
  const Icon = model.icon;
  const stateText = model.state === 'ok' ? 'text-ok' : model.state === 'failing' ? 'text-danger' : 'text-muted';
  const dotTone = model.state === 'ok' ? 'ok' : model.state === 'failing' ? 'danger' : 'neutral';

  return (
    <div className="rounded-xl border border-edge bg-panel p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted" aria-hidden />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{model.name}</span>
        </div>
        <StatusDot tone={dotTone} pulse={model.state === 'ok'} />
      </div>
      <p className={`mt-3 text-xl font-semibold tracking-tight ${stateText}`}>{STATE_LABEL[model.state]}</p>
      <p className="mt-1 truncate font-mono text-[11px] text-muted" title={model.detail}>
        {model.detail}
      </p>
      <p className="mt-3 text-[11px] text-faint">{model.headline}</p>
    </div>
  );
}

export function HealthCards({ health, loading }: { readonly health: SystemHealth | null; readonly loading: boolean }) {
  if (health === null && loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-[132px]" />
        <Skeleton className="h-[132px]" />
        <Skeleton className="h-[132px]" />
      </div>
    );
  }

  const uptime =
    health?.api.status === 'ok' && health.api.uptimeSeconds !== null
      ? `up ${formatDuration(health.api.uptimeSeconds)}`
      : 'no response';

  const cards: readonly HealthCardModel[] = [
    {
      key: 'api',
      name: 'API Gateway',
      icon: Server,
      state: health?.api.status ?? 'unreachable',
      headline: uptime,
      detail: health?.api.status === 'ok' ? 'GET /healthz → 200' : 'GET /healthz failed',
    },
    {
      key: 'postgres',
      name: 'PostgreSQL',
      icon: Database,
      state: health?.postgres.status ?? 'unreachable',
      headline: 'event store · dead letters',
      detail: health?.postgres.detail ?? 'no report',
    },
    {
      key: 'redis',
      name: 'Redis Streams',
      icon: MemoryStick,
      state: health?.redis.status ?? 'unreachable',
      headline: 'event transport · consumer group',
      detail: health?.redis.detail ?? 'no report',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((model) => (
        <HealthCard key={model.key} model={model} />
      ))}
    </div>
  );
}
