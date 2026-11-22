<div align="center">

# ⚡ Event Engine

### Distributed event processing, with a live view of operations.

Ingest events over HTTP · Store them in PostgreSQL · Process them through Redis Streams

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2022.11-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?style=for-the-badge&logo=fastify&logoColor=white)](https://fastify.dev/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![License](https://img.shields.io/badge/License-MIT-7C3AED?style=for-the-badge)](LICENSE)

[Overview](#-overview) · [Quickstart](#-quickstart) · [Architecture](#-architecture) · [API](#-http-api) · [Limitations](#-known-limitations)

[English](README.md) | [فارسی](README.fa.md)

</div>

---

## ✨ Overview

Event Engine is a distributed event processing project with an HTTP API, a PostgreSQL event store, Redis Streams consumers, and a real-time operations console. It brings ingestion, processing, observability, and recovery together in one system.

| Capability             | What it provides                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| **Event ingestion**    | A validated HTTP API with typed error responses and client-supplied `eventId` support for idempotency. |
| **Event storage**      | An append-only PostgreSQL store with global sequencing and optimistic concurrency per aggregate.       |
| **Stream processing**  | Redis consumer groups, batched reads, pending-entry reclaim, and configurable delivery budgets.        |
| **Failure recovery**   | A PostgreSQL dead-letter audit trail and replay of the original event from the store.                  |
| **Observability**      | Structured pino logs, Prometheus metrics, and provisioned Grafana.                                     |
| **Operations console** | A dark-mode dashboard with health cards, metrics, an event/DLQ feed, and an ingestion simulator.       |

> [!IMPORTANT]
> This is a portfolio project, not a claim of production readiness. It has no authentication and has a documented PostgreSQL-to-Redis dual-write gap. Review the [known limitations](#-known-limitations) before deploying it or exposing its services.

## 🚀 Quickstart

**Prerequisites:** Node.js **22.11 or newer**, Git, and Docker Desktop running.

Run these commands from the project root. The shell examples below use Bash; on Windows, use Git Bash or adapt them for PowerShell.

```bash
# Create local configuration from the example; do not overwrite an existing .env.
cp -n .env.example .env

# Install dependencies and start the infrastructure.
npm install
npm run stack:up

# Create the database schema, then start the API and consumer.
npm run prisma:migrate -- --name init
npm run dev
```

In a **second terminal**, start the dashboard:

```bash
npm run dashboard:install
npm run dashboard:dev
```

Open **http://localhost:3100**, then send an event to the API:

```bash
curl -X POST http://localhost:3000/v1/events \
  -H 'content-type: application/json' \
  -d '{"eventType":"order.created","aggregateType":"order","aggregateId":"order-42","payload":{"amount":125.5,"currency":"EUR"}}'
```

Watch the event appear in the dashboard's **Event Stream** table. To explore failures and replay, continue to [Dead-letter recovery](#-dead-letter-recovery).

> [!TIP]
> For prerequisites, configuration, expected outputs, and troubleshooting, see the **[Setup & Operations Guide](docs/OPERATIONS_GUIDE.md)** ([نسخه فارسی](docs/OPERATIONS_GUIDE.fa.md)). The example credentials are for local development only; change them before using the system outside that environment.

## 🧱 Architecture

```text
        ┌───────────────────────────────────────────────────────────┐
        │  client/ (Next.js :3100)  health · metrics · stream ·     │
        │                           ingestion simulator             │
        └────────────────────────────┬──────────────────────────────┘
                                     │ BFF route handlers (/api/*)
        ┌────────────────────────────▼──────────────────────────────┐
        │  engine (Fastify :3000)   interfaces → application →      │
        │                           domain  ◀── infrastructure      │
        └───────┬───────────────────────────────────┬───────────────┘
                │                                   │
      ┌─────────▼─────────┐               ┌─────────▼──────────┐
      │ PostgreSQL :5432  │               │  Redis :6379       │
      │ events · dead     │  publish /    │  events:stream     │
      │ letter_events     │  consume      │  (AOF, noeviction) │
      └───────────────────┘               └────────────────────┘
```

The engine follows a clean architecture dependency rule: the domain layer (`src/domain/`) has no framework imports, while infrastructure and HTTP layers implement ports defined by the application and domain layers. PostgreSQL persistence and Redis publishing are separate operations; see the [dual-write limitation](#-known-limitations).

## 📡 HTTP API

| Method | Endpoint                      | Purpose                                                                                          |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `POST` | `/v1/events`                  | Ingest an event; returns `201`, `400` for validation errors, or `409` for a duplicate `eventId`. |
| `GET`  | `/v1/events`                  | List events, newest first; supports `page`, `pageSize`, and `eventType`.                         |
| `GET`  | `/v1/events/:id`              | Fetch one event.                                                                                 |
| `GET`  | `/v1/dead-letters`            | List the dead-letter audit trail, newest first.                                                  |
| `POST` | `/v1/dead-letters/:id/replay` | Republish the original event to the stream and clear the entry.                                  |
| `GET`  | `/healthz` · `/readyz`        | Liveness and per-dependency readiness; readiness has a 2-second budget.                          |
| `GET`  | `/metrics`                    | Prometheus metrics exposition.                                                                   |

## 🔁 Dead-letter recovery

An opt-in fault-injection hook lets you exercise the failure → retry → dead-letter → replay path without a broken handler. `PROCESSING_FAILURE_PATTERN` is rejected at startup when `NODE_ENV=production`.

```bash
# Add to .env, then restart the engine.
PROCESSING_FAILURE_PATTERN=^payment\.settled$
REDIS_CONSUMER_RECLAIM_IDLE_MS=3000
REDIS_MAX_DELIVERY_ATTEMPTS=3
```

1. Send an event matching the pattern. After the delivery budget is exhausted, it appears with a **DLQ** badge in the dashboard.
2. Remove the failure pattern and restart the engine.
3. Replay the dead-letter entry, replacing `<id>` with its ID:

   ```bash
   curl -X POST http://localhost:3000/v1/dead-letters/<id>/replay
   ```

   Type the actual ID without the angle brackets. The event is republished from PostgreSQL for consumption, and the DLQ row is cleared.

For the full walkthrough, see [section 11 of the operations guide](docs/OPERATIONS_GUIDE.md).

## 🖥️ Operations console

| Area             | What you can inspect                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| **Health**       | API, PostgreSQL, and Redis status with readiness detail.                                              |
| **Metrics**      | Ingest and processing rates, stream length, DLQ total, windowed latency, and derived consumer status. |
| **Event Stream** | A merged, newest-first feed of events and dead letters, with pause/resume controls.                   |
| **Simulator**    | Presets, a JSON payload editor, response details, and an attempt log.                                 |

The browser communicates with Next.js Backend-for-Frontend route handlers. The engine URL (`BACKEND_URL`) stays server-side, avoiding direct browser-to-engine CORS coupling.

## 🧪 Testing

```bash
npm test                 # Engine tests
npm run test:dashboard   # Dashboard BFF and Prometheus parser tests
npm run typecheck
npm run lint
```

The test suites cover HTTP contracts, environment validation, stream parsers, domain invariants, dashboard BFF handlers, and the Prometheus parser. They include error-response checks as well as happy paths and do not require Docker or running services.

## ⚙️ Configuration

Configuration is validated at boot with zod. The table below highlights commonly used settings; see the [configuration reference](docs/OPERATIONS_GUIDE.md#6-configuration-reference) for the complete list.

| Variable                                          | Default                                               | Purpose                                                   |
| ------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| `DATABASE_URL` / `REDIS_URL`                      | —                                                     | Required connection strings.                              |
| `PORT` / `LOG_LEVEL` / `NODE_ENV`                 | `3000` / `info` / `development`                       | Engine runtime settings.                                  |
| `REDIS_STREAM_NAME` / `REDIS_STREAM_MAX_LENGTH`   | `events:stream` / `1000000`                           | Stream identity and length cap.                           |
| `REDIS_CONSUMER_*`, `REDIS_MAX_DELIVERY_ATTEMPTS` | batch 100, block 2 s, reclaim 60 s / 15 s, 5 attempts | Consumer tuning.                                          |
| `CORS_ORIGINS` / `RATE_LIMIT_MAX`                 | `*` / `10000`                                         | HTTP origin and rate-limit settings.                      |
| `PROCESSING_FAILURE_PATTERN`                      | unset                                                 | Fault injection for DLQ testing; forbidden in production. |
| `BACKEND_URL` (client)                            | `http://127.0.0.1:3000`                               | Server-side engine URL for the BFF.                       |

## 📁 Project structure

```text
event-engine/
├── src/            # Engine: domain, application, infrastructure, HTTP interfaces
├── client/         # Next.js console, BFF routes, components, utilities, tests
├── prisma/         # Schema and migrations: events and dead-letter events
├── tests/          # Engine integration and unit tests
├── monitoring/     # Prometheus config and Grafana datasource provisioning
├── docs/           # Setup and operations guides in English and Persian
└── docker-compose.yml
```

## ⚠️ Known limitations

These trade-offs are important when evaluating or extending the system:

1. **Dual-write gap.** The engine appends to PostgreSQL and then publishes to Redis without a spanning transaction. If publishing fails, an event can remain in the store without being published to the stream; there is no automatic republish after a restart. A transactional outbox is a documented follow-up and is not implemented here.
2. **At-least-once semantics.** Redeliveries and concurrent dead-letter replays can produce duplicates. Handlers must be idempotent; a client-supplied `eventId` covers ingestion idempotency.
3. **No authentication.** Anyone able to reach ports 3000 or 3100 can ingest or read data. This is intended for local development; use an authenticating gateway before exposing it.
4. **Derived dashboard signals.** Throughput rates and the consumer-status indicator are inferred from metric deltas, not direct consumer liveness probes.

## 🤝 Contributing

Contributions are welcome. For significant changes, please open an issue first. Keep commits [Conventional Commits](https://www.conventionalcommits.org/)-compliant and run `npm test`, `npm run typecheck`, and `npm run lint` before submitting a pull request. There is not yet a separate contribution guide.

## 📄 License

Distributed under the [MIT License](LICENSE). Copyright © 2026 Ali Rahimpanah.

## 📬 Support

- **Bug reports and feature ideas:** open a [GitHub Issue](../../issues) with reproduction steps and expected versus actual behavior.
- **Setup questions:** start with the [Setup & Operations Guide](docs/OPERATIONS_GUIDE.md), including its troubleshooting section.
- **Other questions:** open a [GitHub Issue](../../issues).

---

<div align="center">

Built by **Ali Rahimpanah** · [Back to top](#-event-engine)

</div>
