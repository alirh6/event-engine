import { describe, expect, it } from 'vitest';

import { loadEnv } from '../../../src/infrastructure/config/env.config.js';

const BASE_ENV = {
  DATABASE_URL: 'postgresql://engine:engine@localhost:5432/engine',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadEnv', (): void => {
  it('applies the documented defaults', (): void => {
    const env = loadEnv(BASE_ENV);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.REDIS_STREAM_NAME).toBe('events:stream');
    expect(env.REDIS_CONSUMER_BATCH_SIZE).toBe(100);
    expect(env.REDIS_MAX_DELIVERY_ATTEMPTS).toBe(5);
    expect(env.RATE_LIMIT_MAX).toBe(10_000);
    expect(env.PROCESSING_FAILURE_PATTERN).toBeUndefined();
  });

  it('coerces numeric variables from strings', (): void => {
    const env = loadEnv({ ...BASE_ENV, PORT: '4000', RATE_LIMIT_MAX: '55' });

    expect(env.PORT).toBe(4000);
    expect(env.RATE_LIMIT_MAX).toBe(55);
  });

  it('keeps the optional fault-injection pattern when provided', (): void => {
    const env = loadEnv({ ...BASE_ENV, PROCESSING_FAILURE_PATTERN: '^payment\\.' });
    expect(env.PROCESSING_FAILURE_PATTERN).toBe('^payment\\.');
  });

  it('throws a descriptive error when required variables are missing', (): void => {
    expect((): void => {
      loadEnv({ REDIS_URL: 'redis://localhost:6379' });
    }).toThrow(/Invalid environment configuration/);
  });

  it('rejects invalid enum values and out-of-range numbers', (): void => {
    expect((): void => {
      loadEnv({ ...BASE_ENV, LOG_LEVEL: 'verbose' });
    }).toThrow(/Invalid environment configuration/);

    expect((): void => {
      loadEnv({ ...BASE_ENV, PORT: '99999' });
    }).toThrow(/Invalid environment configuration/);
  });

  it('refuses fault injection in production', (): void => {
    expect((): void => {
      loadEnv({ ...BASE_ENV, NODE_ENV: 'production', PROCESSING_FAILURE_PATTERN: '^qa\\.' });
    }).toThrow(/PROCESSING_FAILURE_PATTERN must not be set when NODE_ENV=production/);
  });

  it('allows production without fault injection', (): void => {
    const env = loadEnv({ ...BASE_ENV, NODE_ENV: 'production' });
    expect(env.NODE_ENV).toBe('production');
    expect(env.PROCESSING_FAILURE_PATTERN).toBeUndefined();
  });
});
