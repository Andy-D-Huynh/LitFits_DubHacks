import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @fitmirror/shared ships TypeScript source, no build step.
  transpilePackages: ['@fitmirror/shared'],
  // Linting runs from the repo root (`pnpm lint`).
  eslint: { ignoreDuringBuilds: true },
  // Avoid picking a parent lockfile as the workspace root.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
};

export default nextConfig;
