import { join } from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @fitmirror/shared ships TypeScript source, no build step.
  transpilePackages: ['@fitmirror/shared'],
  // Linting runs from the repo root (`pnpm lint`).
  eslint: { ignoreDuringBuilds: true },
  // Demo mode reads fixtures/ at runtime, which lives outside apps/web.
  outputFileTracingRoot: join(import.meta.dirname, '../..'),
  outputFileTracingIncludes: { '/**': ['../../fixtures/**/*.json'] },
};

export default nextConfig;
