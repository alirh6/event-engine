import { DomainError } from './domain-error.js';

/** Raised when an event violates one of its semantic invariants. */
export class InvalidEventError extends DomainError {
  public constructor(message: string) {
    super(message);
  }
}

/** Raised on reads that reference an event which does not exist. */
export class EventRecordNotFoundError extends DomainError {
  public constructor(eventId: string) {
    super(`Event record "${eventId}" was not found`);
  }
}

/** Raised when appending an event whose identity already exists. */
export class EventRecordAlreadyExistsError extends DomainError {
  public constructor(eventId: string) {
    super(`Event record "${eventId}" already exists`);
  }
}

/** Raised when two writers race to append the same aggregate version. */
export class EventVersionConflictError extends DomainError {
  public constructor(details: string) {
    super(`Event version conflict: ${details}`);
  }
}
