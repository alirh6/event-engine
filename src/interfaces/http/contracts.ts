/** Health probes consumed by the readiness endpoint. */
export interface ReadinessChecks {
  readonly checkDatabase: () => Promise<void>;
  readonly checkRedis: () => Promise<void>;
}

/** Prometheus scrape target: raw exposition payload + content type. */
export interface MetricsEndpoint {
  readonly read: () => Promise<string>;
  readonly contentType: string;
}
