import { ensureNonEmptyString, ensureOptionalUuid } from '../shared/guard.js';

/** Structural input for event metadata; every field is optional. */
export interface EventMetadataInput {
  correlationId?: string | undefined;
  causationId?: string | undefined;
  source?: string | undefined;
  attributes?: Record<string, unknown> | undefined;
}

/**
 * Tracing and provenance data attached to an event. Correlation/causation
 * identifiers are UUID-validated so downstream trace stitching never breaks.
 */
export class EventMetadata {
  private constructor(
    public readonly correlationId: string | null,
    public readonly causationId: string | null,
    public readonly source: string | null,
    public readonly attributes: Readonly<Record<string, unknown>>,
  ) {}

  public static from(input: EventMetadataInput | null | undefined): EventMetadata {
    if (input === null || input === undefined) {
      return new EventMetadata(null, null, null, Object.freeze({}));
    }
    return new EventMetadata(
      ensureOptionalUuid(input.correlationId, 'metadata.correlationId'),
      ensureOptionalUuid(input.causationId, 'metadata.causationId'),
      input.source === null || input.source === undefined
        ? null
        : ensureNonEmptyString(input.source, 'metadata.source', 256),
      Object.freeze(input.attributes === null || input.attributes === undefined ? {} : { ...input.attributes }),
    );
  }

  public toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = {};
    if (this.correlationId !== null) {
      json['correlationId'] = this.correlationId;
    }
    if (this.causationId !== null) {
      json['causationId'] = this.causationId;
    }
    if (this.source !== null) {
      json['source'] = this.source;
    }
    if (Object.keys(this.attributes).length > 0) {
      json['attributes'] = { ...this.attributes };
    }
    return json;
  }
}
