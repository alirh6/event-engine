import type { Identifier } from '../shared/identifier.js';

/**
 * Base class for objects with a lasting identity. Two entities are equal
 * when their runtime type and their identifier are equal — nothing else.
 */
export abstract class Entity<TId extends Identifier<unknown>> {
  protected constructor(public readonly id: TId) {}

  public equals(other: Entity<TId> | null | undefined): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    return this.constructor === other.constructor && this.id.equals(other.id);
  }
}
