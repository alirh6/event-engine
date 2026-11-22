import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PinoLogger } from '../../infrastructure/logger/pino.logger.js';

import type { LoggerPort } from '../../application/ports/logger.port.js';
import type { MetricsPort } from '../../application/ports/metrics.port.js';
import type { EventController } from './controllers/event.controller.js';
import type { MetricsEndpoint, ReadinessChecks } from './contracts.js';
import { createErrorHandler } from './middleware/error.handler.js';
import { buildEventRoutes } from './routes/event.routes.js';
import { buildHealthRoutes } from './routes/health.routes.js';
import { buildMetricsRoutes } from './routes/metrics.routes.js';

/** Everything the HTTP server needs, wired by the composition root. */
export interface HttpServerDeps {
  readonly httpLogger: PinoLogger;
  readonly logger: LoggerPort;
  readonly metrics: MetricsPort;
  readonly corsOrigin: boolean | string[];
  readonly rateLimitMax: number;
  readonly controller: EventController;
  readonly readiness: ReadinessChecks;
  readonly metricsEndpoint: MetricsEndpoint;
}

/** Builds the fully configured Fastify instance (no network binding). */
export async function buildServer(deps: HttpServerDeps): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: deps.httpLogger.child({ module: 'http' }),
    trustProxy: true,
    bodyLimit: 1_048_576,
  });

  app.addHook('onResponse', (request: FastifyRequest, reply: FastifyReply, done: () => void): void => {
    const route = request.routeOptions.url ?? 'unmatched';
    deps.metrics.recordHttpRequest(request.method, route, reply.statusCode, reply.elapsedTime / 1000);
    done();
  });

  await app.register(helmet);
  await app.register(cors, { origin: deps.corsOrigin, methods: ['GET', 'POST'] });
  await app.register(rateLimit, { global: true, max: deps.rateLimitMax, timeWindow: '1 minute' });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply): FastifyReply =>
    reply.code(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} was not found`,
      requestId: request.id,
    }),
  );
  app.setErrorHandler(createErrorHandler(deps.logger));

  await app.register(buildHealthRoutes(deps.readiness));
  await app.register(buildMetricsRoutes(deps.metricsEndpoint));
  await app.register(buildEventRoutes(deps.controller), { prefix: '/v1' });

  // Fastify types the instance with the concrete pino logger it was given;
  // callers only rely on the default FastifyInstance surface.
  return app as unknown as FastifyInstance;
}
