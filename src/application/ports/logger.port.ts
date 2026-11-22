/** Structured log context attached to a message. */
export type LogContext = Readonly<Record<string, unknown>>;

/**
 * Logging port consumed by the application and domain layers.
 * Infrastructure provides the concrete adapter (pino).
 */
export interface LoggerPort {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): LoggerPort;
}
