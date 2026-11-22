/** A raw entry as delivered by a log-based message broker. */
export interface StreamEntry {
  readonly id: string;
  readonly fields: Readonly<Record<string, string>>;
}

/** Contract every stream consumer drives; implemented by application processors. */
export interface StreamMessageHandler {
  handle(entry: StreamEntry): Promise<void>;
}
