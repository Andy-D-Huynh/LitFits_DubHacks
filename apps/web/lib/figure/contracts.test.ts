import { describe, expect, it } from 'vitest';
import {
  aspectRatioOf,
  clothingProductSchema,
  clothingProductToWornGarment,
  parseBodyReconstruction,
  renderSizeForBounds,
} from './contracts';

describe('figure contracts', () => {
  it('preserves person-box aspect ratio in the render size', () => {
    const size = renderSizeForBounds({ width: 200, height: 400 });
    expect(size.height).toBe(640);
    expect(size.width / size.height).toBeCloseTo(0.5, 5);
    expect(aspectRatioOf({ width: 200, height: 400 })).toBeCloseTo(0.5, 5);
  });

  it('rejects a product with no source attribution', () => {
    const parsed = clothingProductSchema.safeParse({
      id: 'p1',
      source: '',
      title: 'Tee',
      brand: 'Sample',
      category: 'top',
      imageUrl: '/img.png',
      productUrl: '/shop#p1',
    });
    expect(parsed.success).toBe(false);
  });

  it('maps a catalog product onto a worn garment without inventing a try-on asset', () => {
    const worn = clothingProductToWornGarment({
      id: 'tee-1',
      source: 'demo-catalog',
      title: 'Sample tee',
      brand: 'Northline',
      category: 'top',
      imageUrl: 'data:image/svg+xml,catalog',
      productUrl: '/shop#tee-1',
      availableSizes: ['S', 'M'],
      color: 'navy',
      sample: true,
    });
    expect(worn.productId).toBe('tee-1');
    expect(worn.transparentImageUrl).toBeNull();
    expect(worn.transform?.scaleX).toBeGreaterThan(0);
    expect(worn.layerOrder).toBe(1);
    expect(worn.id).toBe('demo-catalog:tee-1');
  });

  it('rejects a reconstruction that is missing the outline', () => {
    expect(() =>
      parseBodyReconstruction({
        id: 'b1',
        imageWidth: 100,
        imageHeight: 200,
        silhouette: { format: 'png', data: 'data:image/png;base64,xx', width: 50, height: 100 },
        normalizedBounds: { x: 0.1, y: 0.1, width: 0.5, height: 0.8 },
        outline: [],
        quality: { status: 'ok', messages: [], usedFallback: false, method: 'canvas' },
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow();
  });
});
