import type { FastifyReply, FastifyRequest } from 'fastify';

import type { IngestEventHandler } from '../../../application/commands/ingest-event.handler.js';
import type { ReplayDeadLetterHandler } from '../../../application/commands/replay-dead-letter.handler.js';
import { DeadLetterIdParamsSchema, ListDeadLettersQuerySchema } from '../../../application/dtos/dead-letter.dtos.js';
import { EventIdParamsSchema, IngestEventSchema, ListEventsQuerySchema } from '../../../application/dtos/event.dtos.js';
import type { GetEventByIdHandler } from '../../../application/queries/get-event-by-id.handler.js';
import type { ListEventsHandler } from '../../../application/queries/list-events.handler.js';
import type { ListDeadLettersHandler } from '../../../application/queries/list-dead-letters.handler.js';
import { RequestValidationError } from '../errors/request-validation.error.js';

export interface EventControllerHandlers {
  readonly ingest: IngestEventHandler;
  readonly getById: GetEventByIdHandler;
  readonly list: ListEventsHandler;
  readonly deadLetters: ListDeadLettersHandler;
  readonly replayDeadLetter: ReplayDeadLetterHandler;
}

/** Thin HTTP adapter: validate, delegate to use cases, shape responses. */
export class EventController {
  public constructor(private readonly handlers: EventControllerHandlers) {}

  public async ingest(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const parsed = IngestEventSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new RequestValidationError('Request body failed schema validation', parsed.error);
    }
    const event = await this.handlers.ingest.execute({ event: parsed.data });
    return reply.code(201).send(event);
  }

  public async getById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const parsed = EventIdParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      throw new RequestValidationError("Path parameter 'id' must be a UUID", parsed.error);
    }
    const event = await this.handlers.getById.execute({ id: parsed.data.id });
    return reply.code(200).send(event);
  }

  public async list(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const parsed = ListEventsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new RequestValidationError('Query parameters failed schema validation', parsed.error);
    }
    const result = await this.handlers.list.execute({
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      eventType: parsed.data.eventType ?? null,
    });
    return reply.code(200).send(result);
  }

  public async listDeadLetters(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const parsed = ListDeadLettersQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new RequestValidationError('Query parameters failed schema validation', parsed.error);
    }
    const result = await this.handlers.deadLetters.execute({
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
    return reply.code(200).send(result);
  }

  public async replayDeadLetter(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const parsed = DeadLetterIdParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      throw new RequestValidationError("Path parameter 'id' must be a UUID", parsed.error);
    }
    const result = await this.handlers.replayDeadLetter.execute({ id: parsed.data.id });
    return reply.code(200).send(result);
  }
}
