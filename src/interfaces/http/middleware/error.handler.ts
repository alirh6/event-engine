import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

import type { LoggerPort } from '../../../application/ports/logger.port.js';
import { DomainError, InvalidArgumentError } from '../../../domain/errors/domain-error.js';
import { DeadLetterNotFoundError } from '../../../domain/errors/dead-letter.errors.js';
import {
  EventRecordAlreadyExistsError,
  EventRecordNotFoundError,
  EventVersionConflictError,
  InvalidEventError,
} from '../../../domain/errors/event-record.errors.js';
import { errorInfo } from '../../../shared/errors.js';
import { RequestValidationError } from '../errors/request-validation.error.js';

interface ErrorResponseBody {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string;
  readonly requestId: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Central error boundary. Maps domain/application errors onto HTTP status
 * codes, passes framework errors through, and hides internals of 5xx.
 */
export function createErrorHandler(
  logger: LoggerPort,
): (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (error: FastifyError, request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const requestId = request.id;
    if (reply.sent) {
      logger.warn('Error occurred after the response was already sent', { requestId });
      return;
    }

    const body = resolveBody(error, requestId);

    if (body.statusCode >= 500) {
      logger.error('Unhandled request error', {
        requestId,
        method: request.method,
        url: request.url,
        error: errorInfo(error),
      });
    } else {
      logger.debug('Request failed', {
        requestId,
        method: request.method,
        url: request.url,
        statusCode: body.statusCode,
        message: body.message,
      });
    }

    await reply.code(body.statusCode).send(body);
  };
}

function resolveBody(error: FastifyError, requestId: string): ErrorResponseBody {
  if (error instanceof RequestValidationError) {
    return { statusCode: 400, error: 'Bad Request', message: error.message, requestId, details: error.details };
  }
  if (error instanceof InvalidEventError || error instanceof InvalidArgumentError) {
    return { statusCode: 400, error: 'Bad Request', message: error.message, requestId };
  }
  if (error instanceof EventRecordNotFoundError || error instanceof DeadLetterNotFoundError) {
    return { statusCode: 404, error: 'Not Found', message: error.message, requestId };
  }
  if (error instanceof EventRecordAlreadyExistsError || error instanceof EventVersionConflictError) {
    return { statusCode: 409, error: 'Conflict', message: error.message, requestId };
  }
  if (error instanceof DomainError) {
    return { statusCode: 422, error: 'Unprocessable Entity', message: error.message, requestId };
  }

  const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500;
  if (statusCode < 500) {
    return {
      statusCode,
      error: typeof error.code === 'string' ? error.code : error.name,
      message: error.message,
      requestId,
    };
  }
  // Never leak internals for unexpected failures.
  return { statusCode: 500, error: 'Internal Server Error', message: 'An unexpected error occurred.', requestId };
}
