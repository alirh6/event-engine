/**
 * Base class for every error raised by the domain model.
 * The concrete class name is applied automatically so logs and error
 * handlers always see the most specific error name.
 */
export abstract class DomainError extends Error {
  protected constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Raised when an argument violates a structural invariant. */
export class InvalidArgumentError extends DomainError {
  public constructor(message: string) {
    super(message);
  }
}
