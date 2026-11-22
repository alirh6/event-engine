import type { DomainEvent } from '../events/domain-event.base.js';
import type { Identifier } from '../shared/identifier.js';
import { Entity } from './entity.base.js';

/**
 * Consistency boundary of the domain. Aggregate roots collect the domain
 * events they raise; the persistence layer pulls them after a successful
 * transaction and forwards them to the event stream.
 */
export abstract class AggregateRoot<TId extends Identifier<unknown>> extends Entity<TId> {
  private readonly domainEvents: DomainEvent[] = [];

  protected addDomainEvent(event: DomainEvent): void {
    this.domainEvents.push(event);
  }

  /** Returns the recorded events and clears the internal buffer. */
  public pullDomainEvents(): readonly DomainEvent[] {
    const events = [...this.domainEvents];
    this.domainEvents.length = 0;
    return events;
  }

  public get hasPendingDomainEvents(): boolean {
    return this.domainEvents.length > 0;
  }
}
