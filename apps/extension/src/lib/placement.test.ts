import { describe, expect, it } from 'vitest';
import { placeOutfit } from './placement';
import type { OutfitSlots, WornGarment } from './types';

function garment(partial: Pick<WornGarment, 'id' | 'category'>): WornGarment {
  return {
    id: partial.id,
    name: partial.id,
    category: partial.category,
    track: partial.category === 'footwear' || partial.category === 'accessory' ? 'rigid' : 'soft',
    primaryColor: null,
    primaryImageUrl: null,
    imageDataUrl: null,
    cutoutDataUrl: null,
    brand: null,
    sourceUrl: `https://shop.example/${partial.id}`,
    retailer: 'shop',
    price: null,
    addedAt: '2026-01-01T00:00:00.000Z',
  };
}

const empty: OutfitSlots = {
  top: null,
  bottom: null,
  outerwear: null,
  dress: null,
  footwear: null,
  accessory: null,
};

describe('placeOutfit', () => {
  it('dresses bottoms, then shoes, then the top, then the jacket', () => {
    const layers = placeOutfit({
      ...empty,
      top: garment({ id: 'tee', category: 'top' }),
      bottom: garment({ id: 'pant', category: 'bottom' }),
      footwear: garment({ id: 'shoe', category: 'footwear' }),
      outerwear: garment({ id: 'coat', category: 'outerwear' }),
    });
    expect(layers.map((layer) => layer.garment.id)).toEqual(['pant', 'shoe', 'tee', 'coat']);
    expect(layers.find((layer) => layer.garment.id === 'shoe')?.track).toBe('rigid');
    expect(layers.find((layer) => layer.garment.id === 'tee')?.track).toBe('soft');
  });

  it('anchors footwear at the feet instead of stretching it over the torso', () => {
    const [shoe] = placeOutfit({
      ...empty,
      footwear: garment({ id: 'shoe', category: 'footwear' }),
    });
    expect(shoe?.zone.y).toBeGreaterThan(0.7);
    expect(shoe?.zone.h).toBeLessThan(0.25);
  });
});
