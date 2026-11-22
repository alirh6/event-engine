import { z } from 'zod';

/**
 * Server-side environment for the BFF route handlers, validated with zod at
 * module load: a misconfigured dashboard fails loudly on the first request
 * instead of silently targeting the wrong backend. Never import this module
 * from client components — the values must stay server-side.
 */
const ServerEnvSchema = z.object({
  BACKEND_URL: z.string().url().default('http://127.0.0.1:3000'),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const result = ServerEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid dashboard environment: ${JSON.stringify(result.error.flatten().fieldErrors)}`);
  }
  return result.data;
}

export const serverEnv: ServerEnv = loadServerEnv();
