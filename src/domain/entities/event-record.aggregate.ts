import { EventRecordedDomainEvent } from '../events/event-recorded.domain-event.js';
import { AggregateId } from '../value-objects/aggregate-id.vo.js';
import { EventId } from '../value-objects/event-id.vo.js';
import { EventMetadata, type EventMetadataInput } from '../value-objects/event-metadata.vo.js';
import { EventPayload } from '../value-objects/event-payload.vo.js';
import { EventType } from '../value-objects/event-type.vo.js';
import { AggregateRoot } from './aggregate-root.base.js';

/** Structural input for creating a new event record. Nullable fields denote "not provided". */
export interface CreateEventRecordInput {
  readonly eventId: string | null;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: Record<string, unknown>;
  readonly metadata: EventMetadataInput | null;
  readonly occurredAt: Date | null;
}

/** Full persistence snapshot used to rehydrate an aggregate from the store. */
export interface EventRecordSnapshot {
  readonly id: EventId;
  readonly eventType: EventType;
  readonly aggregate: AggregateId;
  readonly payload: EventPayload;
  readonly metadata: EventMetadata;
  readonly version: number;
  readonly occurredAt: Date;
  readonly sequence: bigint | null;
}

/**
 * The core aggregate of the engine: a single, immutable domain event that
 * has been accepted for processing. New instances always raise an
 * `EventRecordedDomainEvent`, which is what gets published to the stream.
 */
export class EventRecord extends AggregateRoot<EventId> {
  private readonly _eventType: EventType;
  private readonly _aggregate: AggregateId;
  private readonly _payload: EventPayload;
  private readonly _metadata: EventMetadata;
  private readonly _occurredAt: Date;
  private readonly _version: number;
  private _sequence: bigint | null;

  private constructor(
    id: EventId,
    eventType: EventType,
    aggregate: AggregateId,
    payload: EventPayload,
    metadata: EventMetadata,
    occurredAt: Date,
    version: number,
  ) {
    super(id);
    this._eventType = eventType;
    this._aggregate = aggregate;
    this._payload = payload;
    this._metadata = metadata;
    this._occurredAt = occurredAt;
    this._version = version;
    this._sequence = null;
  }

  public static create(input: CreateEventRecordInput): EventRecord {
    const eventType = EventType.from(input.eventType);
    const aggregate = AggregateId.from(input.aggregateType, input.aggregateId);
    const payload = EventPayload.from(input.payload);
    const metadata = EventMetadata.from(input.metadata);
    const occurredAt = input.occurredAt ?? new Date();
    const version = 1;
    const id = input.eventId === null ? EventId.generate() : EventId.from(input.eventId);

    const record = new EventRecord(id, eventType, aggregate, payload, metadata, occurredAt, version);
    record.addDomainEvent(
      new EventRecordedDomainEvent({
        eventId: id,
        aggregateType: aggregate.aggregateType,
        aggregateId: aggregate.id,
        version,
        occurredAt,
        eventType,
        payload,
        metadata,
      }),
    );
    return record;
  }

  public static rehydrate(snapshot: EventRecordSnapshot): EventRecord {
    const record = new EventRecord(
      snapshot.id,
      snapshot.eventType,
      snapshot.aggregate,
      snapshot.payload,
      snapshot.metadata,
      snapshot.occurredAt,
      snapshot.version,
    );
    record._sequence = snapshot.sequence;
    return record;
  }

  public get eventType(): EventType {
    return this._eventType;
  }

  public get aggregateType(): string {
    return this._aggregate.aggregateType;
  }

  public get aggregateId(): string {
    return this._aggregate.id;
  }

  public get payload(): EventPayload {
    return this._payload;
  }

  public get metadata(): EventMetadata {
    return this._metadata;
  }

  public get occurredAt(): Date {
    return this._occurredAt;
  }

  public get version(): number {
    return this._version;
  }

  /** Rebuilds the domain event this record raised, e.g. for stream replay. */
  public toRecordedEvent(): EventRecordedDomainEvent {
    return new EventRecordedDomainEvent({
      eventId: this.id,
      aggregateType: this._aggregate.aggregateType,
      aggregateId: this._aggregate.id,
      version: this._version,
      occurredAt: this._occurredAt,
      eventType: this._eventType,
      payload: this._payload,
      metadata: this._metadata,
    });
  }

  /** Globally ordered store position; `null` until persisted. */
  public get sequence(): bigint | null {
    return this._sequence;
  }

  /** Called by the persistence layer after a successful append. */
  public attachSequence(sequence: bigint): void {
    this._sequence ??= sequence;
  }
}
