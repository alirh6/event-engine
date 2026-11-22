import { NextResponse } from 'next/server';

import { backendFetch, backendFetchJson, backendUnreachableResponse } from '@/lib/backend';

function forwardQuery(request: Request, allowed: readonly string[]): string {
  const incoming = new URL(request.url).searchParams;
  const forwarded = new URLSearchParams();
  for (const key of allowed) {
    const value = incoming.get(key);
    if (value !== null && value.length > 0) {
      forwarded.set(key, value);
    }
  }
  return forwarded.toString();
}

export async function GET(request: Request): Promise<NextResponse> {
  const query = forwardQuery(request, ['page', 'pageSize', 'eventType']);
  const suffix = query.length > 0 ? `?${query}` : '';
  try {
    const result = await backendFetchJson(`/v1/events${suffix}`);
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return backendUnreachableResponse();
  }
}

/** Ingestion proxy: forwards the raw body so the engine stays the validator. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const rawBody = await request.text();
    const response = await backendFetch('/v1/events', { method: 'POST', body: rawBody });
    const body: unknown = await response.json();
    return NextResponse.json(body, { status: response.status });
  } catch {
    return backendUnreachableResponse();
  }
}
