import type { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';

import type { MetricsEndpoint } from '../contracts.js';

/** Registers the Prometheus scrape endpoint. */
export function buildMetricsRoutes(metrics: MetricsEndpoint): FastifyPluginCallback {
  return (app: FastifyInstance): void => {
    app.get('/metrics', async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const payload = await metrics.read();
      return reply.header('content-type', metrics.contentType).send(payload);
    });
  };
}
