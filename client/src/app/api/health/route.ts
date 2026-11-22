import { NextResponse } from 'next/server';

import { backendFetchJson } from '@/lib/backend';
import type { SystemHealth } from '@/lib/types';

interface LivenessBody {
  status?: unknown;
  uptimeSeconds?: unknown;
}

interface ReadinessBody {
  checks?: {
    database?: unknown;
    redis?: unknown;
  };
}

interface CheckResult {
  status: 'ok' | 'failing' | 'unreachable';
  detail: string;
}

function toCheck(value: unknown, unreachableDetail: string): CheckResult {
  if (value === undefined || value === null) {
    return { status: 'unreachable', detail: unreachableDetail };
  }
  const detail = typeof value === 'string' ? value : 'unknown response';
  return { status: detail === 'ok' ? 'ok' : 'failing', detail };
}

function offlineHealth(fetchedAt: number): SystemHealth {
  return {
    api: { status: 'unreachable', uptimeSeconds: null },
    postgres: { status: 'unreachable', detail: 'engine unreachable' },
    redis: { status: 'unreachable', detail: 'engine unreachable' },
    fetchedAt,
  };
}

/**
 * Combined health snapshot for the dashboard: liveness from `/healthz`,
 * per-dependency status from `/readyz`. A fully unreachable engine is still
 * valid health data, so it resolves to 200 with `unreachable` markers.
 */
export async function GET(): Promise<NextResponse> {
  const fetchedAt = Date.now();
  try {
    const [liveness, readiness] = await Promise.all([backendFetchJson('/healthz'), backendFetchJson('/readyz')]);

    const livenessBody = (liveness.body ?? {}) as LivenessBody;
    const readinessBody = (readiness.body ?? {}) as ReadinessBody;
    const readinessReached = readiness.status < 500 || readiness.status === 503;

    const health: SystemHealth = {
      api: {
        status: liveness.status === 200 ? 'ok' : 'unreachable',
        uptimeSeconds: typeof livenessBody.uptimeSeconds === 'number' ? livenessBody.uptimeSeconds : null,
      },
      postgres: readinessReached
        ? toCheck(readinessBody.checks?.database, 'no report')
        : { status: 'unreachable', detail: `readyz returned ${readiness.status}` },
      redis: readinessReached
        ? toCheck(readinessBody.checks?.redis, 'no report')
        : { status: 'unreachable', detail: `readyz returned ${readiness.status}` },
      fetchedAt,
    };
    return NextResponse.json(health, { status: 200 });
  } catch {
    return NextResponse.json(offlineHealth(fetchedAt), { status: 200 });
  }
}
