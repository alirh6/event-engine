const CLOCK_FORMAT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** `14:03:22` for a dashboard timeline column. */
export function formatClock(timestampMs: number): string {
  return CLOCK_FORMAT.format(new Date(timestampMs));
}

/** `12s ago` / `3m ago` / `—` for last-refresh indicators. */
export function formatRelative(timestampMs: number | null, nowMs: number): string {
  if (timestampMs === null) {
    return '—';
  }
  const seconds = Math.max(0, Math.round((nowMs - timestampMs) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  return `${Math.floor(seconds / 60)}m ago`;
}

/** `4m 12s` for process uptime. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) {
    return '—';
  }
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

export function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString('en-US');
}

export function formatMs(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  if (value >= 100) {
    return `${Math.round(value).toLocaleString('en-US')} ms`;
  }
  return `${value.toFixed(1)} ms`;
}

/** `3f8f6a1e…` for table id columns; full id stays available via title. */
export function shortId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 8)}…`;
}
