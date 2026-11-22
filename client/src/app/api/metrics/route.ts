import { NextResponse } from 'next/server';

import { backendFetch, backendUnreachableResponse } from '@/lib/backend';
import { buildSnapshot } from '@/lib/metrics-parser';

/**
 * Fetches the engine's Prometheus exposition endpoint and normalizes it into
 * a JSON snapshot. Rate computation happens client-side from consecutive
 * snapshots so the dashboard controls its own windowing.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const response = await backendFetch('/metrics');
    const text = await response.text();
    return NextResponse.json(buildSnapshot(text, Date.now()), { status: 200 });
  } catch {
    return backendUnreachableResponse();
  }
}
