# Event Engine Console

Real-time operations dashboard for the event processing engine. Next.js 15 (App Router), TypeScript, Tailwind CSS v4, lucide-react. Dark, Grafana-style, fully responsive.

## Features

- **System health cards** — API gateway, PostgreSQL and Redis, driven by `/healthz` + `/readyz` (per-dependency detail strings, uptime, pulsing status dots).
- **Live metrics viewer** — polls the engine's Prometheus exposition every 2 s through a normalizing BFF route and derives: ingest req/s (sparkline), processed events/s, Redis stream length, dead-lettered total, windowed ingest latency, and a derived consumer status (Consuming / Idle / Stalled).
- **Event stream table** — merged, newest-first feed of ingested events and dead-lettered entries with new-row flash animation, sticky header, pause/resume.
- **Ingestion simulator** — validated form posting to `POST /v1/events` with one-click event presets (order.created, payment.settled, …), JSON payload editor, metadata (source/correlation id), response panel (201 + id/sequence, or 4xx with zod field errors) and an attempt log with latencies.

## Architecture

The browser never talks to the engine directly. Next.js route handlers act as a Backend-for-Frontend:

```
browser ──▶ /api/health        ──▶ engine /healthz + /readyz   (combined snapshot)
        ├─▶ /api/metrics       ──▶ engine /metrics             (Prom text → JSON snapshot)
        ├─▶ /api/events        ──▶ engine /v1/events           (GET + POST proxy)
        └─▶ /api/dead-letters  ──▶ engine /v1/dead-letters     (DLQ audit feed)
```

`BACKEND_URL` is read server-side only, so the engine never needs to be exposed to the browser and no CORS coupling exists.

## Getting started

```bash
# from the repository root — engine + postgres + redis
npm run stack:up
npm install && npm run prisma:migrate -- --name init
npm run dev            # engine on :3000

# dashboard
cd client
npm install
npm run dev            # console on http://localhost:3100
```

`BACKEND_URL` defaults to `http://127.0.0.1:3000` — override in `client/.env.local` for remote engines.

## Ports

| Service          | Port |
| ---------------- | ---- |
| Event engine API | 3000 |
| Grafana          | 3001 |
| This console     | 3100 |

## Scripts

| Script              | Action                     |
| ------------------- | -------------------------- |
| `npm run dev`       | Dev server on :3100        |
| `npm run build`     | Production build           |
| `npm run start`     | Serve the production build |
| `npm run typecheck` | `tsc --noEmit`             |
| `npm test`          | Vitest suite (15 tests)    |

> ⚠️ Do not run `npm run build` while `npm run dev` is serving — both write to `.next/` and the dev server's cache gets corrupted (observed: `Cannot find module './897.js'` → HTTP 500). Stop the dev server first, or run the production build from a checkout without a live dev process.

## Testing

The suite runs the real BFF route handlers with a stubbed global `fetch`, so no engine process is needed:

- **`tests/api/bff-routes.spec.ts`** — health snapshot combining `/healthz` + `/readyz` (including 503 degradation and fully-offline fallback), metrics normalization, query forwarding for events/dead-letters, ingest body forwarding with status passthrough, backend 400 error bodies passed through verbatim, and `502 backend_unreachable` on connection failures.
- **`tests/api/metrics-parser.spec.ts`** — Prometheus text parser: labelled samples, malformed-line tolerance, and the zeroed-counter snapshot for an empty exposition.

Run with `npm test` (or `npm run test:watch`); typecheck with `npm run typecheck`.

## Polling cadence

| Data         | Interval |
| ------------ | -------- |
| Health       | 5 s      |
| Metrics      | 2 s      |
| Events + DLQ | 2.5 s    |

Polling pauses automatically while the browser tab is hidden and can be frozen manually with **Pause live**; the last good data stays visible with a stale indicator.
