import { InvalidArgumentError } from '../errors/domain-error.js';
import { UUID_PATTERN } from './patterns.js';

/** Ensures the value is a non-empty, length-bounded string. */
export function ensureNonEmptyString(value: unknown, fieldName: string, maxLength = 256): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidArgumentError(`${fieldName} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new InvalidArgumentError(`${fieldName} must not exceed ${maxLength} characters`);
  }
  return value;
}

/**
 * Ensures an optional UUID-shaped value is either absent (`null`/`undefined`)
 * or a well-formed UUID, returning the normalized lowercase form.
 */
export function ensureOptionalUuid(value: string | null | undefined, fieldName: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!UUID_PATTERN.test(value)) {
    throw new InvalidArgumentError(`${fieldName} must be a valid UUID`);
  }
  return value.toLowerCase();
}
