import path from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Do not advertise the framework version in responses.
  poweredByHeader: false,
  // The monorepo (and the user home directory) contain other lockfiles; pin
  // the workspace root so file tracing and cache paths stay inside client/.
  outputFileTracingRoot: path.resolve(import.meta.dirname),
};

export default nextConfig;
