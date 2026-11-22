import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'accent';

const BADGE_TONES: Record<Tone, string> = {
  ok: 'border-ok/30 bg-ok/10 text-ok',
  warn: 'border-warn/30 bg-warn/10 text-warn',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  neutral: 'border-edge bg-panel-elevated text-muted',
  accent: 'border-accent/30 bg-accent/10 text-accent',
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const DOT_TONES: Record<Exclude<Tone, 'accent'>, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  neutral: 'bg-faint',
};

export function StatusDot({ tone, pulse = false }: { tone: Exclude<Tone, 'accent'>; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5" role="presentation">
      {pulse && tone === 'ok' ? (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${DOT_TONES[tone]}`}
        />
      ) : null}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${DOT_TONES[tone]}`} />
    </span>
  );
}

interface PanelProps {
  readonly title: string;
  readonly icon?: LucideIcon;
  readonly actions?: ReactNode;
  readonly bodyClassName?: string;
  readonly className?: string;
  readonly children: ReactNode;
}

export function Panel({ title, icon: Icon, actions, bodyClassName = '', className = '', children }: PanelProps) {
  return (
    <section
      className={`rounded-xl border border-edge bg-panel shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03),0_12px_32px_-16px_rgba(0,0,0,0.7)] ${className}`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden /> : null}
          <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</h2>
        </div>
        {actions}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-panel-elevated ${className}`} />;
}
