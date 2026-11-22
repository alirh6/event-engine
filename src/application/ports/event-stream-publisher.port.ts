import type { DomainEvent } from '../../domain/events/domain-event.base.js';

/**
 * Outbound port that transports raised domain events onto the broker.
 * Implemented by the Redis Streams publisher in infrastructure.
 */
export interface EventStreamPublisher {
  publish(event: DomainEvent): Promise<void>;
}
