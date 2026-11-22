import type { EventMetadata } from '../value-objects/event-metadata.vo.js';
import type { EventPayload } from '../value-objects/event-payload.vo.js';
import type { EventType } from '../value-objects/event-type.vo.js';
import type { DomainEventProps } from './domain-event.base.js';
import { DomainEvent } from './domain-event.base.js';

export interface EventRecordedEventProps extends DomainEventProps {
  readonly eventType: EventType;
  readonly payload: EventPayload;
  readonly metadata: EventMetadata;
}

/** Raised whenever a new event record is accepted into the engine. */
export class EventRecordedDomainEvent extends DomainEvent {
  public readonly eventType: EventType;
  public readonly payload: EventPayload;
  public readonly metadata: EventMetadata;

  public constructor(props: EventRecordedEventProps) {
    super(props);
    this.eventType = props.eventType;
    this.payload = props.payload;
    this.metadata = props.metadata;
  }
}
