import { NextResponse } from 'next/server';

import { serverEnv } from './env';

/** Base URL of the event engine API, resolved server-side only. */
export const BACKEND_URL = serverEnv.BACKEND_URL.replace(/\/+$/, '');

const BACKEND_TIMEOUT_MS = 5_000;

/** Thrown when the engine API cannot be reached at all. */
export class BackendError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'BackendError';
  }
}

/**
 * Server-side fetch against the engine API. Always no-store: this is live
 * telemetry, and route handlers must never serve cached snapshots.
 */
export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new BackendError(`Event engine API is unreachable at ${BACKEND_URL}`);
  }
}

export interface BackendJson {
  status: number;
  body: unknown;
}

/** Fetches and parses a JSON endpoint without throwing on HTTP error statuses. */
export async function backendFetchJson(path: string, init?: RequestInit): Promise<BackendJson> {
  const response = await backendFetch(path, init);
  const body: unknown = await response.json();
  return { status: response.status, body };
}

/** Standard 502 payload used when the engine cannot be reached. */
export function backendUnreachableResponse(): NextResponse {
  return NextResponse.json(
    { error: 'backend_unreachable', message: 'Event engine API is unreachable.' },
    { status: 502 },
  );
}
