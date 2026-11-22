import type { MetricsPort } from '../ports/metrics.port.js';
import type { LoggerPort } from '../ports/logger.port.js';
import type { EventStreamPublisher } from '../ports/event-stream-publisher.port.js';
import type { EventRecordRepository } from '../../domain/repositories/event-record.repository.js';
import { EventRecord } from '../../domain/entities/event-record.aggregate.js';
import { EventRecordMapper } from '../mappers/event-record.mapper.js';
import type { EventResponseDto, IngestEventDto } from '../dtos/event.dtos.js';
import { performance } from 'node:perf_hooks';

/** Command carrying the validated ingestion payload. */
export interface IngestEventCommand {
  readonly event: IngestEventDto;
}

/**
 * Primary ingestion use case: validate the aggregate invariants, append the
 * event to the store, then publish the raised domain event to the stream.
 */
export class IngestEventHandler {
  public constructor(
    private readonly eventStore: EventRecordRepository,
    private readonly streamPublisher: EventStreamPublisher,
    private readonly metrics: MetricsPort,
    private readonly logger: LoggerPort,
  ) {}

  public async execute(command: IngestEventCommand): Promise<EventResponseDto> {
    const startedAt = performance.now();
    const dto = command.event;

    const record = EventRecord.create({
      eventId: dto.eventId ?? null,
      eventType: dto.eventType,
      aggregateType: dto.aggregateType,
      aggregateId: dto.aggregateId,
      payload: dto.payload,
      metadata: dto.metadata ?? null,
      occurredAt: dto.occurredAt === undefined ? null : new Date(dto.occurredAt),
    });

    await this.eventStore.append(record);

    for (const domainEvent of record.pullDomainEvents()) {
      await this.streamPublisher.publish(domainEvent);
    }

    this.metrics.recordEventIngested(record.eventType.value);
    this.metrics.recordIngestDuration(record.eventType.value, (performance.now() - startedAt) / 1000);

    this.logger.info('Event ingested', {
      eventId: record.id.value,
      eventType: record.eventType.value,
      aggregateType: record.aggregateType,
      aggregateId: record.aggregateId,
      version: record.version,
    });

    return EventRecordMapper.toResponse(record);
  }
}
