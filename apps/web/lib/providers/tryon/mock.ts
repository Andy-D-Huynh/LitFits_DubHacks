import type { TryOnInput, TryOnProvider } from './types';

// Served from apps/web/public, so it works with no network.
export const TRYON_PLACEHOLDER_URL = '/tryon-placeholder.svg';

// Returns precomputed images from fixtures/renders/, keyed by garment image URL,
// and a placeholder image when none exists. The real lookup (by layer cache
// key) arrives with the renders in M3.
export class MockTryOn implements TryOnProvider {
  readonly name = 'mock';

  constructor(private readonly renders: ReadonlyMap<string, string> = new Map()) {}

  async render(input: TryOnInput): Promise<{ imageUrl: string }> {
    return { imageUrl: this.renders.get(input.garmentImageUrl) ?? TRYON_PLACEHOLDER_URL };
  }
}
