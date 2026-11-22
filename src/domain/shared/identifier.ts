/**
 * A value that carries identity by its content, never by reference.
 * Every identifier used by an entity implements this contract so that
 * equality comparisons stay semantics-based across the whole domain.
 */
export interface Identifier<T> {
  readonly value: T;
  equals(other: Identifier<T>): boolean;
  toString(): string;
}
