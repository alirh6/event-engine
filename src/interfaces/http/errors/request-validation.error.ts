import type { ZodError } from 'zod';

/** Raised when an inbound HTTP payload fails zod validation. */
export class RequestValidationError extends Error {
  public readonly details: Readonly<Record<string, unknown>>;

  public constructor(message: string, validationError: ZodError) {
    super(message);
    this.name = 'RequestValidationError';
    const flattened = validationError.flatten();
    this.details = { formErrors: flattened.formErrors, fieldErrors: flattened.fieldErrors };
  }
}
