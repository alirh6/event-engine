import { DomainError } from './domain-error.js';

/** Raised when a dead-letter lookup references an entry that does not exist. */
export class DeadLetterNotFoundError extends DomainError {
  public constructor(entryId: string) {
    super(`Dead letter entry "${entryId}" was not found`);
  }
}
