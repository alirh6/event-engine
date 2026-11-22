import type { EventId } from '../value-objects/event-id.vo.js';

/** Structural data every domain event carries. */
export interface DomainEventProps {
  readonly eventId: EventId;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly version: number;
  readonly occurredAt: Date;
}

/** Base class for all domain events raised by aggregates. */
export abstract class DomainEvent {
  public readonly eventId: EventId;
  public readonly aggregateType: string;
  public readonly aggregateId: string;
  public readonly version: number;
  public readonly occurredAt: Date;

  protected constructor(props: DomainEventProps) {
    this.eventId = props.eventId;
    this.aggregateType = props.aggregateType;
    this.aggregateId = props.aggregateId;
    this.version = props.version;
    this.occurredAt = props.occurredAt;
  }

  /** Most specific runtime type name, used for logging and stream routing. */
  public get name(): string {
    return this.constructor.name;
  }
}
