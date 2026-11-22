import { z } from 'zod';

/**
 * Fail-fast, schema-validated environment. The process refuses to boot when
 * configuration is missing or malformed — no silent defaults for critical
 * connection strings.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().min(1),

  REDIS_URL: z.string().min(1),
  REDIS_STREAM_NAME: z.string().min(1).default('events:stream'),
  REDIS_STREAM_MAX_LENGTH: z.coerce.number().int().positive().default(1_000_000),
  REDIS_CONSUMER_GROUP: z.string().min(1).default('engine-workers'),
  REDIS_CONSUMER_NAME: z.string().min(1).default('worker-1'),
  REDIS_CONSUMER_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
  REDIS_CONSUMER_BLOCK_MS: z.coerce.number().int().min(100).max(60_000).default(2_000),
  REDIS_CONSUMER_RECLAIM_IDLE_MS: z.coerce.number().int().min(1000).default(60_000),
  REDIS_CONSUMER_RECLAIM_INTERVAL_MS: z.coerce.number().int().min(1000).default(15_000),
  REDIS_MAX_DELIVERY_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(5),

  CORS_ORIGINS: z.string().default('*'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10_000),

  /**
   * Optional fault injection for DLQ verification: stream entries whose event
   * type matches this regex fail processing until they dead-letter. Unset by
   * default — production must never enable it.
   */
  PROCESSING_FAILURE_PATTERN: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    throw new Error(`Invalid environment configuration: ${JSON.stringify(fieldErrors)}`);
  }
  if (result.data.NODE_ENV === 'production' && result.data.PROCESSING_FAILURE_PATTERN !== undefined) {
    // Fault injection deliberately breaks processing; it must never ride
    // into a production deployment through a stray environment variable.
    throw new Error(
      'Invalid environment configuration: PROCESSING_FAILURE_PATTERN must not be set when NODE_ENV=production',
    );
  }
  return result.data;
}
