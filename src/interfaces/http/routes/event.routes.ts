import type { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';

import type { EventController } from '../controllers/event.controller.js';

/** Registers the `/v1/events` resource. */
export function buildEventRoutes(controller: EventController): FastifyPluginCallback {
  return (app: FastifyInstance): void => {
    app.post('/events', (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> =>
      controller.ingest(request, reply),
    );

    app.get('/events', (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> =>
      controller.list(request, reply),
    );

    app.get(
      '/events/:id',
      (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<FastifyReply> =>
        controller.getById(request, reply),
    );

    app.get('/dead-letters', (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> =>
      controller.listDeadLetters(request, reply),
    );

    app.post(
      '/dead-letters/:id/replay',
      (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<FastifyReply> =>
        controller.replayDeadLetter(request, reply),
    );
  };
}
