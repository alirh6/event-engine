import pino from 'pino';

import type { LoggerPort, LogContext } from '../../application/ports/logger.port.js';
import type { Env } from '../config/env.config.js';

export type PinoLogger = pino.Logger;

const SERVICE_NAME = 'event-engine';

/** Builds the process-wide pino logger with redaction and pretty printing in development. */
export function createLogger(env: Env): PinoLogger {
  const prettyTransport =
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
        }
      : undefined;

  return pino({
    level: env.LOG_LEVEL,
    base: { service: SERVICE_NAME, env: env.NODE_ENV },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label: string): { level: string } => ({ level: label }),
    },
    ...(prettyTransport === undefined ? {} : { transport: prettyTransport }),
  });
}

/** Adapter implementing the application `LoggerPort` on top of pino. */
export class PinoLoggerAdapter implements LoggerPort {
  public constructor(private readonly logger: PinoLogger) {}

  public debug(message: string, context?: LogContext): void {
    this.logger.debug({ ...context }, message);
  }

  public info(message: string, context?: LogContext): void {
    this.logger.info({ ...context }, message);
  }

  public warn(message: string, context?: LogContext): void {
    this.logger.warn({ ...context }, message);
  }

  public error(message: string, context?: LogContext): void {
    this.logger.error({ ...context }, message);
  }

  public child(context: LogContext): LoggerPort {
    return new PinoLoggerAdapter(this.logger.child({ ...context }));
  }

  public get raw(): PinoLogger {
    return this.logger;
  }
}
