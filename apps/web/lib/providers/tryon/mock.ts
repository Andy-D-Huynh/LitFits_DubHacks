import type { TryOnInput, TryOnProvider } from './types';

// Returns precomputed images from fixtures/renders/, keyed by garment image URL.
// The real lookup (by layer cache key) arrives with the renders in M3.
export class MockTryOn implements TryOnProvider {
  readonly name = 'mock';

  constructor(private readonly renders: ReadonlyMap<string, string> = new Map()) {}

  async render(input: TryOnInput): Promise<{ imageUrl: string }> {
    const imageUrl = this.renders.get(input.garmentImageUrl);
    if (!imageUrl) throw new Error(`MockTryOn: no precomputed render for ${input.garmentImageUrl}`);
    return { imageUrl };
  }
}
