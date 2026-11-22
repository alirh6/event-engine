import { InvalidArgumentError } from '../errors/domain-error.js';
import { ensureNonEmptyString } from '../shared/guard.js';
import { AGGREGATE_TYPE_PATTERN } from '../shared/patterns.js';

/** Identifies the aggregate an event belongs to: a typed, validated reference such as `order:ord-42`. */
export class AggregateId {
  private constructor(
    public readonly aggregateType: string,
    public readonly id: string,
  ) {}

  public static from(aggregateType: string, id: string): AggregateId {
    const type = ensureNonEmptyString(aggregateType, 'aggregateType', 64).toLowerCase();
    if (!AGGREGATE_TYPE_PATTERN.test(type)) {
      throw new InvalidArgumentError(`aggregateType "${type}" must be kebab-case such as 'order'`);
    }
    const identifier = ensureNonEmptyString(id, 'aggregateId', 128);
    return new AggregateId(type, identifier);
  }

  public get value(): string {
    return `${this.aggregateType}:${this.id}`;
  }

  public equals(other: AggregateId): boolean {
    return other.aggregateType === this.aggregateType && other.id === this.id;
  }

  public toString(): string {
    return this.value;
  }
}
