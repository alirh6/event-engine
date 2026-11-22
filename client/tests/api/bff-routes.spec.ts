import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET as deadLettersGet } from '@/app/api/dead-letters/route';
import { GET as eventsGet, POST as eventsPost } from '@/app/api/events/route';
import { GET as healthGet } from '@/app/api/health/route';
import { GET as metricsGet } from '@/app/api/metrics/route';

type FetchResponder = (url: string, init?: RequestInit) => Response | Promise<Response>;

/**
 * Route handlers call `fetch` through lib/backend; stubbing the global keeps
 * these tests hermetic (no engine process required) while still exercising
 * the real route code paths, status mapping, and query forwarding.
 */
function stubFetch(responder: FetchResponder): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      return await responder(url, init);
    }),
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach((): void => {
  vi.unstubAllGlobals();
});

describe('GET /api/health', (): void => {
  it('combines liveness and readiness into one snapshot', async (): Promise<void> => {
    stubFetch((url) => {
      if (url.endsWith('/healthz')) {
        return jsonResponse({ status: 'ok', uptimeSeconds: 42 });
      }
      return jsonResponse({ status: 'ok', checks: { database: 'ok', redis: 'ok' } });
    });

    const response = await healthGet();
    const body = (await response.json()) as {
      api: { status: string; uptimeSeconds: number | null };
      postgres: { status: string; detail: string };
      redis: { status: string };
    };

    expect(response.status).toBe(200);
    expect(body.api).toEqual({ status: 'ok', uptimeSeconds: 42 });
    expect(body.postgres).toEqual({ status: 'ok', detail: 'ok' });
    expect(body.redis.status).toBe('ok');
  });

  it('marks dependencies as failing when readiness degrades to 503', async (): Promise<void> => {
    stubFetch((url) => {
      if (url.endsWith('/healthz')) {
        return jsonResponse({ status: 'ok', uptimeSeconds: 42 });
      }
      return jsonResponse({ status: 'unavailable', checks: { database: 'error: postgres down', redis: 'ok' } }, 503);
    });

    const response = await healthGet();
    const body = (await response.json()) as {
      postgres: { status: string; detail: string };
      redis: { status: string };
    };

    expect(body.postgres.status).toBe('failing');
    expect(body.postgres.detail).toContain('postgres down');
    expect(body.redis.status).toBe('ok');
  });

  it('resolves to a fully offline snapshot when the engine is unreachable', async (): Promise<void> => {
    stubFetch(async () => {
      throw new Error('connection refused');
    });

    const response = await healthGet();
    const body = (await response.json()) as {
      api: { status: string };
      postgres: { status: string; detail: string };
      redis: { status: string };
    };

    expect(response.status).toBe(200);
    expect(body.api.status).toBe('unreachable');
    expect(body.postgres.status).toBe('unreachable');
    expect(body.redis.status).toBe('unreachable');
  });
});

describe('GET /api/metrics', (): void => {
  it('normalizes the Prometheus exposition into JSON', async (): Promise<void> => {
    stubFetch(
      () =>
        new Response(
          'event_engine_stream_length 12345\nevent_engine_http_requests_total{method="POST",route="/v1/events",statusCode="201"} 3\n',
          { status: 200 },
        ),
    );

    const response = await metricsGet();
    const body = (await response.json()) as { streamLength: number | null; ingestHttpPostTotal: number };

    expect(response.status).toBe(200);
    expect(body.streamLength).toBe(12_345);
    expect(body.ingestHttpPostTotal).toBe(3);
  });

  it('returns 502 when the engine cannot be reached', async (): Promise<void> => {
    stubFetch(async () => {
      throw new Error('connection refused');
    });

    const response = await metricsGet();
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(502);
    expect(body.error).toBe('backend_unreachable');
  });
});

describe('/api/events', (): void => {
  it('forwards query parameters to the engine list endpoint', async (): Promise<void> => {
    let requestedUrl = '';
    stubFetch((url) => {
      requestedUrl = url;
      return jsonResponse({ items: [], total: 0 });
    });

    const request = new Request('http://dashboard.local/api/events?page=2&pageSize=10&eventType=order.created');
    const response = await eventsGet(request);
    const body = (await response.json()) as { total: number };

    expect(requestedUrl).toContain('/v1/events?page=2&pageSize=10&eventType=order.created');
    expect(response.status).toBe(200);
    expect(body.total).toBe(0);
  });

  it('forwards the ingest body and passes backend statuses through', async (): Promise<void> => {
    let capturedInit: RequestInit | undefined;
    stubFetch((url, init) => {
      if (!url.endsWith('/v1/events')) {
        return jsonResponse({}, 404);
      }
      capturedInit = init;
      return jsonResponse({ id: 'abc' }, 201);
    });

    const payload = JSON.stringify({
      eventType: 'order.created',
      aggregateType: 'order',
      aggregateId: 'a-1',
      payload: { amount: 1 },
    });
    const request = new Request('http://dashboard.local/api/events', { method: 'POST', body: payload });
    const response = await eventsPost(request);
    const body = (await response.json()) as { id: string };

    expect(capturedInit?.method).toBe('POST');
    expect(capturedInit?.body).toBe(payload);
    expect(response.status).toBe(201);
    expect(body.id).toBe('abc');
  });

  it('passes backend validation errors through verbatim (clean 400s)', async (): Promise<void> => {
    stubFetch(() =>
      jsonResponse(
        {
          statusCode: 400,
          error: 'Bad Request',
          message: 'Request body failed schema validation',
          requestId: 'req-1',
          details: { fieldErrors: { eventType: ['Invalid'] } },
        },
        400,
      ),
    );

    const request = new Request('http://dashboard.local/api/events', { method: 'POST', body: '{}' });
    const response = await eventsPost(request);
    const body = (await response.json()) as {
      statusCode: number;
      details?: { fieldErrors?: Record<string, string[]> };
    };

    expect(response.status).toBe(400);
    expect(body.statusCode).toBe(400);
    expect(body.details?.fieldErrors?.eventType).toEqual(['Invalid']);
  });

  it('returns 502 when the engine is unreachable', async (): Promise<void> => {
    stubFetch(async () => {
      throw new Error('connection refused');
    });

    const request = new Request('http://dashboard.local/api/events', { method: 'POST', body: '{}' });
    const response = await eventsPost(request);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(502);
    expect(body.error).toBe('backend_unreachable');
  });
});

describe('GET /api/dead-letters', (): void => {
  it('forwards pagination and returns the DLQ page', async (): Promise<void> => {
    let requestedUrl = '';
    stubFetch((url) => {
      requestedUrl = url;
      return jsonResponse({ items: [{ redisEntryId: '1-9' }], total: 1 });
    });

    const request = new Request('http://dashboard.local/api/dead-letters?page=1&pageSize=5');
    const response = await deadLettersGet(request);
    const body = (await response.json()) as { total: number };

    expect(requestedUrl).toContain('/v1/dead-letters?page=1&pageSize=5');
    expect(response.status).toBe(200);
    expect(body.total).toBe(1);
  });

  it('returns 502 when the engine is unreachable', async (): Promise<void> => {
    stubFetch(async () => {
      throw new Error('connection refused');
    });

    const response = await deadLettersGet(new Request('http://dashboard.local/api/dead-letters'));
    expect(response.status).toBe(502);
  });
});
