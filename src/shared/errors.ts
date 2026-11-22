/**
 * A type alias (not an interface) so the shape carries an implicit index
 * signature and can be passed anywhere a `Record<string, unknown>` is expected.
 */
export type ErrorInfo = {
  readonly name: string;
  readonly message: string;
  readonly stack: string | undefined;
};

/** Normalizes any thrown value into a structured, loggable shape. */
export function errorInfo(error: unknown): ErrorInfo {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: 'NonErrorValue', message: String(error), stack: undefined };
}
