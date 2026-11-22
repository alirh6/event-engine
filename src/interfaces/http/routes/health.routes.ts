import type { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';

import { withTimeout } from '../../../shared/with-timeout.js';
import type { ReadinessChecks } from '../contracts.js';

const READY_CHECK_TIMEOUT_MS = 2_000;

/** Registers liveness (`/healthz`) and readiness (`/readyz`) probes. */
export function buildHealthRoutes(checks: ReadinessChecks): FastifyPluginCallback {
  return (app: FastifyInstance): void => {
    app.get('/healthz', (_request: FastifyRequest, reply: FastifyReply): FastifyReply =>
      reply.code(200).send({
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      }),
    );

    app.get('/readyz', async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const results = await Promise.allSettled([
        withTimeout(checks.checkDatabase(), READY_CHECK_TIMEOUT_MS, 'PostgreSQL readiness check'),
        withTimeout(checks.checkRedis(), READY_CHECK_TIMEOUT_MS, 'Redis readiness check'),
      ]);

      const databaseOk = results[0]?.status === 'fulfilled';
      const redisOk = results[1]?.status === 'fulfilled';
      const ready = databaseOk && redisOk;

      return reply.code(ready ? 200 : 503).send({
        status: ready ? 'ok' : 'unavailable',
        checks: {
          database: describeCheck(results[0]),
          redis: describeCheck(results[1]),
        },
        timestamp: new Date().toISOString(),
      });
    });
  };
}

function describeCheck(result: PromiseSettledResult<void> | undefined): string {
  if (result === undefined) {
    return 'not evaluated';
  }
  if (result.status === 'fulfilled') {
    return 'ok';
  }
  const reason: unknown = result.reason;
  return `error: ${String(reason)}`;
}
