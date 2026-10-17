import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @fitmirror/shared ships TypeScript source, no build step.
  transpilePackages: ['@fitmirror/shared'],
  // Linting runs from the repo root (`pnpm lint`).
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
