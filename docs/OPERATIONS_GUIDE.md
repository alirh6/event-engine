# Event Engine — Setup & Operations Guide

> **Language:** English | [فارسی](./OPERATIONS_GUIDE.fa.md)
> Audience: a brand-new user with **no prior knowledge** of this project.
> Every command below was executed and verified against the real stack (Dockerized PostgreSQL 17 + Redis 7.4) on Windows 11 with Git Bash; version-specific behavior is marked as such.

---

## 1. What this project is (conceptual overview)

This project is an **event processing engine**: a backend service that accepts _events_ (small JSON messages describing something that happened, e.g. "an order was created") over an HTTP API, stores them durably in a PostgreSQL database, and forwards them onto a Redis Stream so that background consumers can process them asynchronously and independently of the HTTP request.

It ships with four cooperating parts:

1. **The engine** — a Node.js/TypeScript HTTP API + background consumer (`src/main.ts`).
2. **PostgreSQL** — the durable "source of truth" where every accepted event is stored forever (append-only).
3. **Redis Streams** — the transport layer that decouples ingestion from processing (at-least-once delivery).
4. **A web dashboard** — a Next.js application (port 3100) that shows system health, live throughput metrics, the merged event/dead-letter feed, and lets you inject test events through the browser.

Supporting cast: **Prometheus** (metrics scraping), **Grafana** (dashboards), a full test suite (59 tests), and Docker Compose to run all infrastructure with one command.

In one sentence: _you POST an event, it is persisted safely, streamed to a consumer group, processed with automatic retries, dead-lettered if it keeps failing, and you can watch all of it happen in real time in a browser._

---

## 2. System components and ports

| Component                   | Technology                             | Default port | Started by                          |
| --------------------------- | -------------------------------------- | ------------ | ----------------------------------- |
| Event engine API + consumer | Node.js ≥ 22, Fastify 5                | `3000`       | `npm run dev` (repo root)           |
| Web dashboard               | Next.js 15 (App Router), React 19      | `3100`       | `npm run dashboard:dev` (repo root) |
| PostgreSQL                  | `postgres:17-alpine`                   | `5432`       | `npm run stack:up` (Docker)         |
| Redis                       | `redis:7.4-alpine` (AOF, `noeviction`) | `6379`       | `npm run stack:up` (Docker)         |
| Prometheus                  | `prom/prometheus:v3.2.1`               | `9090`       | `npm run stack:up` (Docker)         |
| Grafana                     | `grafana/grafana:11.6.0`               | `3001`       | `npm run stack:up` (Docker)         |

> ⚠️ Port note: the dashboard deliberately uses **3100** (not 3000, which the engine uses; Grafana uses 3001).

---

## 3. Prerequisites and installation

You need exactly three tools installed on your machine.

### 3.1 Node.js ≥ 22.11.0 (includes npm)

Check whether you have it:

```bash
node --version    # must print v22.x.x or higher
npm --version     # must print 10.x or higher
```

If missing, install from <https://nodejs.org> (LTS line), or with [nvm-windows](https://github.com/coreybutler/nvm-windows) / [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 22
nvm use 22
```

The exact minimum version is enforced by `"engines": { "node": ">=22.11.0" }` in `package.json` (repo root). Node 22 is required for native ESM/TypeScript tooling used by this project.

### 3.2 Docker Desktop (engine running)

Docker provides PostgreSQL, Redis, Prometheus and Grafana so you do not have to install any of them natively.

Check whether the Docker **daemon** is running (a common pitfall — having Docker Desktop _installed_ is not enough):

```bash
docker info --format '{{.ServerVersion}}'   # prints e.g. 29.9.1 when running
```

If it prints an error such as `failed to connect to the docker API ...`, start **Docker Desktop**:

- **Windows:** launch `Docker Desktop` from the Start Menu (if installed per-user it lives at `C:\Users\<you>\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe`), and wait until its tray icon says "Docker Desktop is running". First start after booting can take 1–3 minutes.
- **macOS:** launch Docker from Applications.
- **Linux:** `sudo systemctl start docker`.

Verified during acceptance testing with Docker engine **29.9.1**.

### 3.3 Git

Needed so that `npm install` can activate the Git hooks (pre-commit lint/format and Conventional-Commit message validation). Check with `git --version`; install from <https://git-scm.com>. On Windows use **Git Bash** (ships with Git) for the shell commands in this guide.

That is all — PostgreSQL, Redis, Prometheus and Grafana come from Docker images; you never install them natively.

---

## 4. Getting the source code

```bash
cd <wherever-you-keep-projects>          # e.g. C:\Users\you\Desktop
git clone <repository-url> event-engine  # or copy the folder
cd event-engine                          # ALL commands below run from here
```

For this guide, the project root is referred to as `event-engine/`. On the reference machine it is `C:\Users\GIGABYTE-PC\Desktop\ai\event-engine`.

---

## 5. Project layout (every directory explained)

```
event-engine/
├── package.json                  # engine dependencies + ALL npm scripts (root)
├── tsconfig.json                 # strict TypeScript config (engine + tests)
├── tsconfig.build.json           # production build config (src/ only → dist/)
├── eslint.config.mjs             # ESLint 9 flat config (type-checked)
├── .prettierrc.json              # formatting rules
├── lint-staged.config.mjs        # pre-commit: eslint --fix + prettier on staged files
├── commitlint.config.mjs         # Conventional Commits enforcement
├── vitest.config.ts              # engine test runner config
├── docker-compose.yml            # PostgreSQL + Redis + Prometheus + Grafana
├── .env                          # your local engine configuration (git-ignored)
├── .env.example                  # template with every variable documented
├── .nvmrc                        # Node version hint (22)
├── .husky/                       # Git hooks: pre-commit, commit-msg
│
├── src/                          # ===== THE ENGINE (TypeScript) =====
│   ├── main.ts                   # entry point: boots everything in order
│   ├── domain/                   # pure business model (zero framework imports)
│   │   ├── entities/             #   EventRecord aggregate + base classes
│   │   ├── value-objects/        #   EventId, EventType, AggregateId, EventPayload, EventMetadata
│   │   ├── events/               #   DomainEvent base + EventRecorded event
│   │   ├── repositories/         #   EventRecordRepository (interface only)
│   │   ├── errors/               #   typed error hierarchy
│   │   └── shared/               #   identifier contract, regex patterns, guards
│   ├── application/              # use cases (orchestration), framework-free
│   │   ├── commands/             #   IngestEvent, ReplayDeadLetter handlers
│   │   ├── queries/              #   GetEventById, ListEvents, ListDeadLetters handlers
│   │   ├── processing/           #   StreamEventProcessor (consumer-side use case)
│   │   ├── ports/                #   interfaces the app needs: logger, metrics,
│   │   │                         #   publisher, stream handler, dead-letter store
│   │   ├── dtos/                 #   zod request schemas + response shapes
│   │   └── mappers/              #   domain → DTO mapping
│   ├── infrastructure/           # adapters that implement the ports
│   │   ├── config/env.config.ts  #   zod-validated environment (fail-fast boot)
│   │   ├── database/             #   Prisma connection, repositories, mappers
│   │   ├── redis/                #   connection, stream publisher, consumer, parsers
│   │   ├── logger/pino.logger.ts #   pino logging adapter
│   │   ├── metrics/engine.metrics.ts  # prom-client registry
│   │   └── di/container.ts       #   composition root (wires everything)
│   ├── interfaces/http/          # Fastify layer: server, routes, controllers,
│   │                             # error handler, health/ready/metrics probes
│   └── shared/                   # errorInfo + withTimeout utilities
│
├── prisma/
│   ├── schema.prisma             # tables: events (append-only store),
│   │                             #         dead_letter_events (audit)
│   └── migrations/               # SQL migrations (created by prisma migrate)
│
├── tests/                        # 44 engine tests (no Docker required)
│   ├── integration/http/api.contract.spec.ts
│   └── unit/{config,domain,infrastructure}/
│
├── client/                       # ===== THE DASHBOARD (Next.js 15) =====
│   ├── package.json              # dashboard dependencies + scripts
│   ├── next.config.ts            # strict mode, no x-powered-by, tracing root
│   ├── .env                      # BACKEND_URL for the BFF (git-ignored)
│   ├── .env.example              # documented template
│   ├── src/app/                  # App Router: page.tsx (dashboard), layout.tsx,
│   │   │                         # globals.css (dark theme)
│   │   └── api/                  # Backend-for-Frontend proxy routes:
│   │       ├── health/route.ts   #   GET  /api/health     → engine /healthz + /readyz
│   │       ├── metrics/route.ts  #   GET  /api/metrics    → engine /metrics (parsed)
│   │       ├── events/route.ts   #   GET/POST /api/events → engine /v1/events
│   │       └── dead-letters/route.ts
│   ├── src/components/           # UI widgets (health cards, KPIs, table, simulator…)
│   ├── src/lib/                  # backend client, prometheus parser, polling hook…
│   ├── tests/api/                # 15 dashboard tests (handlers + parser)
│   └── README.md                 # dashboard-specific documentation
│
├── monitoring/
│   ├── prometheus/prometheus.yml                        # scrape config
│   └── grafana/provisioning/datasources/prometheus.yml  # auto-provisioned datasource
│
└── docs/
    ├── OPERATIONS_GUIDE.md       # this file (English)
    └── OPERATIONS_GUIDE.fa.md    # this file (Persian)
```

---

## 6. Configuration reference

### 6.1 Engine configuration — file `event-engine/.env`

The engine reads a single `.env` file at the repository root (loaded by `dotenv` inside `src/main.ts`) and validates it with zod at startup (`src/infrastructure/config/env.config.ts`). **If anything is missing or invalid, the process refuses to boot** and prints which variables are wrong.

If the file does not exist, create it from the template:

```bash
cp .env.example .env
```

Every variable, its default, and meaning:

| Variable                             | Default          | Required | Meaning                                                                                                                                                      |
| ------------------------------------ | ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                           | `development`    | no       | `development` \| `test` \| `production`                                                                                                                      |
| `PORT`                               | `3000`           | no       | HTTP port of the engine                                                                                                                                      |
| `LOG_LEVEL`                          | `info`           | no       | `fatal`…`trace` (pino levels)                                                                                                                                |
| `DATABASE_URL`                       | —                | **yes**  | PostgreSQL URL. Local default: `postgresql://event_engine:event_engine@localhost:5432/event_engine?schema=public&connection_limit=20&pool_timeout=10`        |
| `REDIS_URL`                          | —                | **yes**  | Redis URL, e.g. `redis://localhost:6379`                                                                                                                     |
| `REDIS_STREAM_NAME`                  | `events:stream`  | no       | Name of the Redis Stream                                                                                                                                     |
| `REDIS_STREAM_MAX_LENGTH`            | `1000000`        | no       | Approximate `MAXLEN ~` cap bounding stream memory                                                                                                            |
| `REDIS_CONSUMER_GROUP`               | `engine-workers` | no       | Consumer group name                                                                                                                                          |
| `REDIS_CONSUMER_NAME`                | `worker-1`       | no       | This consumer's name inside the group                                                                                                                        |
| `REDIS_CONSUMER_BATCH_SIZE`          | `100`            | no       | Entries per `XREADGROUP` batch (1–1000)                                                                                                                      |
| `REDIS_CONSUMER_BLOCK_MS`            | `2000`           | no       | Long-poll window per read (100–60000)                                                                                                                        |
| `REDIS_CONSUMER_RECLAIM_IDLE_MS`     | `60000`          | no       | Pending entries idle longer than this are reclaimed from stalled consumers                                                                                   |
| `REDIS_CONSUMER_RECLAIM_INTERVAL_MS` | `15000`          | no       | How often the reclaim scan runs                                                                                                                              |
| `REDIS_MAX_DELIVERY_ATTEMPTS`        | `5`              | no       | Delivery budget before an entry is dead-lettered                                                                                                             |
| `CORS_ORIGINS`                       | `*`              | no       | Comma-separated origins, or `*`                                                                                                                              |
| `RATE_LIMIT_MAX`                     | `10000`          | no       | Requests per minute per IP                                                                                                                                   |
| `PROCESSING_FAILURE_PATTERN`         | _(unset)_        | no       | **Fault injection for DLQ testing only** — event types matching this regex fail processing until dead-lettered. Rejected at boot when `NODE_ENV=production`. |

The shipped `.env` matches the Docker Compose defaults below, so the out-of-the-box combination works without edits.

### 6.2 Dashboard configuration — file `event-engine/client/.env`

```bash
cp client/.env.example client/.env
```

| Variable      | Default                 | Meaning                                                                                                                                                         |
| ------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BACKEND_URL` | `http://127.0.0.1:3000` | Where the dashboard's server-side proxy routes find the engine. Server-side only — never shipped to the browser. Validated with zod in `client/src/lib/env.ts`. |

### 6.3 Docker Compose variables

`docker-compose.yml` also reads optional variables from the root `.env` (with safe defaults): `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (all `event_engine`), `POSTGRES_PORT` (5432), `REDIS_PORT` (6379), `PROMETHEUS_PORT` (9090), `GRAFANA_PORT` (3001), `GRAFANA_ADMIN_USER`/`GRAFANA_ADMIN_PASSWORD` (`admin`/`admin`). These are local-development credentials — change them via `.env` if needed.

---

## 7. First run — step by step

Run every command from the repository root (`event-engine/`). Expected outputs are real outputs captured during acceptance testing.

**Step 1 — install engine dependencies** (also activates Git hooks via the `prepare` script):

```bash
npm install
```

**Step 2 — start the infrastructure** (all four containers):

```bash
npm run stack:up
```

Wait until healthy (first run downloads images — a few minutes):

```bash
docker compose ps
# event-engine-postgres     Up … (healthy)
# event-engine-redis        Up … (healthy)
# event-engine-prometheus   Up … (healthy)
# event-engine-grafana      Up …
```

Direct probes (optional but reassuring):

```bash
docker compose exec -T postgres pg_isready -U event_engine -d event_engine   # accepting connections
docker compose exec -T redis redis-cli ping                                  # PONG
```

**Step 3 — create the database schema** (one time; creates `prisma/migrations/`):

```bash
npm run prisma:migrate -- --name init
# … Your database is now in sync with your schema.
```

> If Prisma warns about drift or offers a _reset_, **stop and read** — a reset deletes data. On a fresh volume this never happens.

**Step 4 — start the engine** (terminal 1; keep it open):

```bash
npm run dev
```

You will see pino logs; the engine is ready when `healthz` answers. Check from a second terminal:

```bash
curl http://localhost:3000/healthz
# {"status":"ok","uptimeSeconds":22,"timestamp":"…"}
curl http://localhost:3000/readyz
# {"status":"ok","checks":{"database":"ok","redis":"ok"},"timestamp":"…"}
```

**Step 5 — install and start the dashboard** (terminal 2):

```bash
npm run dashboard:install    # npm install inside client/
npm run dashboard:dev        # next dev -p 3100
```

Open **http://localhost:3100**. Within one polling cycle (≤ 5 s) the three health cards turn green and the console is live.

**You now have a fully running system.** Continue with §9 (API), §10 (dashboard) or §11 (dead-letter recovery).

---

## 8. How the system works at runtime (execution flow)

### 8.1 Startup sequence (`src/main.ts`)

1. `loadEnv()` (`src/infrastructure/config/env.config.ts`) — validates all environment variables; aborts on any problem.
2. `buildContainer()` (`src/infrastructure/di/container.ts`) — the composition root wires concrete implementations to the application ports (Prisma repository, Redis publisher/consumer, pino logger, prom-client metrics).
3. Connect to PostgreSQL (`src/infrastructure/database/prisma.connection.ts`), connect to Redis (`src/infrastructure/redis/redis.connection.ts`).
4. `buildServer()` (`src/interfaces/http/server.ts`) — Fastify with helmet, CORS, per-IP rate limiting, a request-metrics hook, structured error handler, and the route plugins (`src/interfaces/http/routes/`).
5. `app.listen(:3000)` then `eventConsumer.start()` — the background consumer creates its Redis consumer group if missing (`XGROUP CREATE … MKSTREAM`) and enters its read loop.
6. Signal handlers: `SIGTERM`/`SIGINT` trigger a graceful shutdown (stop consumer → close HTTP → stop metrics timer → close Redis → close Prisma, with a 10 s force-exit guard).

### 8.2 Ingestion path (foreground)

`POST /v1/events` → `src/interfaces/http/routes/event.routes.ts` → `src/interfaces/http/controllers/event.controller.ts` (zod validation via `src/application/dtos/event.dtos.ts`; failures become a clean HTTP 400 with per-field errors) → `IngestEventHandler` (`src/application/commands/ingest-event.handler.ts`) → domain creation (`src/domain/entities/event-record.aggregate.ts`, validates event type/aggregate/payload and raises a domain event) → **PostgreSQL append first** (`src/infrastructure/database/repositories/prisma-event-record.repository.ts`, assigns a global `sequence`) → **then Redis publish** (`src/infrastructure/redis/redis-stream.publisher.ts`, `XADD … MAXLEN ~ <cap>`, bounded by a 5 s timeout) → HTTP 201 with the stored event.

### 8.3 Consumer path (background)

`RedisStreamConsumer` (`src/infrastructure/redis/redis-stream.consumer.ts`) loops forever:

1. `XREADGROUP … COUNT 100 BLOCK 2000 STREAMS events:stream >` — fetch new entries.
2. Each entry → `StreamEventProcessor` (`src/application/processing/stream-event.processor.ts`): zod-decodes the message, dispatches to any handler registered for that event type (none registered by default — entries are validated and acknowledged), records `processed` metrics.
3. Success → `XACK`. Failure → **no ack**; the entry stays in the Pending Entries List (PEL).
4. Every `REDIS_CONSUMER_RECLAIM_INTERVAL_MS`, entries pending longer than `REDIS_CONSUMER_RECLAIM_IDLE_MS` are reclaimed via `XPENDING`/`XCLAIM` (crashed consumers self-heal).
5. An entry whose delivery count reaches `REDIS_MAX_DELIVERY_ATTEMPTS` is written to `dead_letter_events` in PostgreSQL (`PrismaDeadLetterStore`) and acknowledged — it never blocks the group again.

### 8.4 Recovery path

`POST /v1/dead-letters/:id/replay` (`src/application/commands/replay-dead-letter.handler.ts`) loads the original event **from PostgreSQL** (full fidelity), re-publishes it to the stream, and deletes the dead-letter row — but only after a successful publish, so a failed replay never loses the entry.

---

## 9. HTTP API reference (engine, port 3000)

All bodies are JSON. Errors use one envelope: `{"statusCode", "error", "message", "requestId", "details?"}`.

### 9.1 Ingest an event

```bash
curl -X POST http://localhost:3000/v1/events \
  -H 'content-type: application/json' \
  -d '{
    "eventType": "order.created",
    "aggregateType": "order",
    "aggregateId": "order-42",
    "payload": { "amount": 125.5, "currency": "EUR" },
    "metadata": { "source": "web-checkout" }
  }'
```

- `eventType` — lowercase token like `order.created` (regex-enforced), 3–128 chars.
- `aggregateType` — kebab-case, 2–64 chars.
- `aggregateId` — free-form id, 1–128 chars.
- `payload` — **non-empty** JSON object.
- `metadata` — optional; `source` (string), `correlationId`/`causationId` (UUIDs), `attributes` (object).
- `eventId` — optional UUID; supply the same value to make ingestion idempotent.

**201 response** (real output):

```json
{
  "id": "d7842965-fcaa-45c7-a000-d08bed7e27b3",
  "eventType": "order.created",
  "aggregateType": "order",
  "aggregateId": "order-42",
  "version": 1,
  "payload": { "amount": 125.5, "currency": "EUR" },
  "metadata": { "source": "web-checkout" },
  "occurredAt": "2026-10-31T21:41:52.808Z",
  "sequence": "1"
}
```

**400 on validation failure** (real output):

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Request body failed schema validation",
  "requestId": "req-9",
  "details": { "formErrors": [], "fieldErrors": { "eventType": ["…must be a lowercase…"] } }
}
```

**409** when a supplied `eventId` already exists (idempotency guard).

### 9.2 List events

```bash
curl "http://localhost:3000/v1/events?page=1&pageSize=50&eventType=order.created"
```

→ `{ "items": [...], "page": 1, "pageSize": 50, "total": 2, "totalPages": 1 }` — newest first (by store sequence).

### 9.3 Get one event

```bash
curl http://localhost:3000/v1/events/<id>     # 200 | 404 | 400 (malformed id)
```

### 9.4 Dead letters and replay

```bash
curl http://localhost:3000/v1/dead-letters?page=1&pageSize=50
curl -X POST http://localhost:3000/v1/dead-letters/<deadLetterId>/replay
# → {"replayed":true,"deadLetterId":"…","eventId":"…"}
```

### 9.5 Probes and metrics

```bash
curl http://localhost:3000/healthz    # liveness: {"status":"ok",…}
curl http://localhost:3000/readyz     # readiness: per-dependency status, 2 s budget
curl http://localhost:3000/metrics    # Prometheus exposition
```

---

## 10. Using the web dashboard (port 3100)

Open <http://localhost:3100>. The page (`client/src/app/page.tsx`) polls through server-side BFF routes — the browser never talks to the engine directly.

- **Health cards** (`client/src/components/health-cards.tsx`) — API Gateway, PostgreSQL, Redis; each shows Healthy/Failing/Offline with the actual readiness detail string. Polls every 5 s.
- **Metrics panel** (`client/src/components/metrics-panel.tsx`) — ingest req/s + sparkline, processed events/s, Redis stream length, dead-lettered total, ingest latency, and a derived consumer status pill (Consuming/Idle/Stalled). Polls every 2 s. Note: rates and the status pill are _inferred_ from counter deltas; the counters and stream length are directly measured.
- **Event Stream table** (`client/src/components/event-stream-table.tsx`) — merged, newest-first feed of ingested events (green **Success**) and dead-lettered entries (red **DLQ** badge with the error and attempt count). New rows flash; pausable.
- **Ingestion Simulator** (`client/src/components/ingestion-simulator.tsx`) — form on the right. Pick a preset (`order.created`, `payment.settled`, `user.signed_up`, `shipment.dispatched`), edit the JSON payload, press **Send event**. A green panel shows `201 Created · latency · id · sequence`; validation failures show the exact field errors; every attempt is logged with status + latency. Sent events appear in the table within ~2.5 s and move the sparklines.
- **Pause live** (header) freezes all polling; the last data stays on screen.

---

## 11. Dead-letter recovery walkthrough (verified commands)

This exercises the full failure→audit→recovery loop in about a minute.

**1 — Enable fault injection and speed up retries** — add to `event-engine/.env`, then restart the engine (Ctrl+C, `npm run dev`):

```bash
PROCESSING_FAILURE_PATTERN=^qa\.dlq$
REDIS_CONSUMER_RECLAIM_IDLE_MS=3000
REDIS_CONSUMER_RECLAIM_INTERVAL_MS=2000
REDIS_MAX_DELIVERY_ATTEMPTS=3
```

**2 — Send a doomed event:**

```bash
curl -X POST http://localhost:3000/v1/events -H 'content-type: application/json' \
  -d '{"eventType":"qa.dlq","aggregateType":"qa","aggregateId":"qa-demo-1","payload":{"scenario":"demo"}}'
```

After ~10 s: `failed` counter = 3, `dead_lettered` = 1, and the table shows a red **DLQ** row.

**3 — Inspect:**

```bash
curl http://localhost:3000/v1/dead-letters
```

**4 — Fix the fault:** remove `PROCESSING_FAILURE_PATTERN` from `.env` and restart the engine.

**5 — Replay:**

```bash
curl -X POST http://localhost:3000/v1/dead-letters/<deadLetterId>/replay
# → {"replayed":true,"deadLetterId":"…","eventId":"…"}
```

The event is re-published **from PostgreSQL** (original payload/metadata preserved), consumed successfully this time, and the DLQ row is deleted. Verified end-to-end during acceptance testing.

---

## 12. Running the tests

```bash
npm test                 # engine: 44 tests — HTTP contract suite (in-memory ports,
                         # app.inject), env validation, stream parsers, domain
npm run test:dashboard   # dashboard: 15 tests — BFF handlers with stubbed fetch
npm run typecheck        # engine tsc --noEmit
npm --prefix client run typecheck
npm run lint             # engine ESLint (type-checked)
npm --prefix client run lint
```

None of the tests require Docker or running services (HTTP tests use in-memory port fakes through Fastify's `app.inject()`; dashboard tests stub `fetch`). Real-service behavior was additionally verified manually — see §15 of the README and the acceptance notes.

---

## 13. Production-style build and run

```bash
npm run build            # tsc → dist/
node dist/main.js        # start the compiled engine
npm run dashboard:build  # next build (client/.next)
npm --prefix client start   # serve the dashboard build on :3100
```

> ⚠️ Do **not** run `npm run dashboard:build` while `npm run dashboard:dev` is serving — both write to `client/.next/` and the dev server's cache gets corrupted (observed: `Cannot find module './897.js'` → HTTP 500). Stop dev first; if corrupted anyway, stop dev, delete `client/.next/` (regenerable cache, no user data), start dev again.

---

## 14. Monitoring (Prometheus + Grafana)

Included in `npm run stack:up`:

- Prometheus UI: <http://localhost:9090> — scrapes the engine at `host.docker.internal:3000/metrics` every 15 s (see `monitoring/prometheus/prometheus.yml`).
- Grafana UI: <http://localhost:3001> — login `admin`/`admin` (override with `GRAFANA_ADMIN_*` in `.env`); the Prometheus datasource is auto-provisioned from `monitoring/grafana/provisioning/datasources/prometheus.yml`.

Key metric series (all prefixed `event_engine_`): `events_ingested_total`, `events_processed_total{status}`, `ingest_duration_seconds`, `processing_duration_seconds`, `http_request_duration_seconds`, `http_requests_total`, `stream_length`.

---

## 15. Stopping and cleaning up

```bash
# Stop the engine and dashboard: Ctrl+C in their terminals.

# Stop all containers (data is KEPT in Docker volumes):
npm run stack:down

# Later: resume exactly where you left off (no migration needed again):
npm run stack:up && npm run dev
```

Data lives in named Docker volumes (`postgres-data`, `redis-data`, `prometheus-data`, `grafana-data` — see `docker-compose.yml`). Events survive container restarts and host reboots.

> ⚠️ **Destructive:** `docker compose down -v` also deletes the volumes and therefore **all stored events and dead letters**. Do not run it unless you accept total data loss.

---

## 16. Troubleshooting

| Symptom                                                                | Cause                                                                                                 | Fix                                                                                                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `failed to connect to the docker API at npipe:…`                       | Docker Desktop not running                                                                            | Start Docker Desktop; wait for "Docker Desktop is running"; retry `docker info`.                                              |
| `EADDRINUSE` / port already in use on 3000/3100                        | Another process owns the port                                                                         | Find it: `netstat -ano \| findstr :3000` (Windows) or `lsof -i :3000`; stop that process.                                     |
| Engine starts but curl gets HTML/strange responses from :3000          | A foreign process bound `127.0.0.1:3000`, shadowing the engine's `0.0.0.0:3000` (Windows allows both) | Identify and stop the foreign process; the engine itself is fine.                                                             |
| `npm run dev` killed but :3000 still listening (Windows)               | `tsx watch` child orphaned when the npm parent is killed                                              | `netstat -ano \| findstr :3000` → `taskkill /PID <pid> /F`.                                                                   |
| Dashboard returns HTTP 500 `Cannot find module './897.js'`             | `next build` ran while `next dev` was serving the same `.next/`                                       | Stop dev, delete `client/.next/` (regenerable cache), start dev again.                                                        |
| `curl /readyz` → 503 with `TimeoutError: Redis health check timed out` | Redis container stopped/unreachable                                                                   | `docker compose start redis`; verify `docker compose exec -T redis redis-cli ping`.                                           |
| Ingest returns 500 after ~5 s during a Redis outage                    | Publish timeout (by design — previously this hung)                                                    | Event **is persisted** in PostgreSQL; the publish flushes when Redis returns if the process stayed up. See Known limitations. |
| 409 `already exists` on ingest                                         | You re-sent an `eventId` that was stored                                                              | Expected idempotency behavior; use a fresh UUID to create a new event.                                                        |
| Prisma offers to _reset_ the database during `migrate dev`             | Schema drift between migrations and the database                                                      | **Do not accept a reset** unless data loss is acceptable; investigate with `npx prisma migrate status` first.                 |
| Husky warning ` .git can't be found` during `npm install`              | Folder is not a Git repository                                                                        | `git init` in the project root, then re-run `npm install`.                                                                    |
| `Cannot find module '@prisma/client'`                                  | Prisma client not generated                                                                           | `npm run prisma:generate`.                                                                                                    |
| Grafana login rejected                                                 | Credentials changed                                                                                   | Default is `admin`/`admin` unless `GRAFANA_ADMIN_USER/PASSWORD` set in `.env`.                                                |

---

## 17. Known limitations (verified, not hidden)

1. **Dual-write gap.** Ingest appends to PostgreSQL, then publishes to Redis (no transaction spanning both). With Redis down, ingest fails fast (~5 s) but the event is already persisted and **not** in the stream; while the process stays up the queued publish flushes on reconnect (observed), but if the process restarts mid-outage the event remains stored with **no automatic re-publish**. Proper fix: transactional outbox (documented follow-up, intentionally not implemented).
2. **At-least-once replay.** Concurrent dead-letter replays can publish duplicates (verified). Handlers must be idempotent.
3. **No authentication.** Anyone who can reach ports 3000/3100 can ingest and read data. Local development product only.
4. **Dashboard rates/status are inferred** from counter deltas, not direct consumer liveness probes.
5. **Graceful SIGTERM shutdown is implemented but not verifiable on Windows** (external signals hard-kill Node there); verified by code inspection only.

---

## 18. Complete command reference

| Where     | Command                                                           | Action                                       |
| --------- | ----------------------------------------------------------------- | -------------------------------------------- |
| root      | `npm install`                                                     | Install engine deps + activate Git hooks     |
| root      | `npm run stack:up` / `stack:down`                                 | Start / stop all Docker containers           |
| root      | `npm run prisma:migrate -- --name init`                           | Create + apply schema                        |
| root      | `npm run prisma:generate` / `prisma:deploy`                       | Generate client / apply committed migrations |
| root      | `npm run dev`                                                     | Engine dev server (watch mode) + consumer    |
| root      | `npm run build` / `start`                                         | Compile to `dist/` / run compiled engine     |
| root      | `npm test` / `test:dashboard` / `test:watch`                      | Test suites                                  |
| root      | `npm run typecheck` / `lint` / `format`                           | Quality gates                                |
| root      | `npm run dashboard:install` / `dashboard:dev` / `dashboard:build` | Dashboard lifecycle                          |
| `client/` | `npm run dev` / `build` / `start` / `typecheck` / `test`          | Same, inside the dashboard package           |
