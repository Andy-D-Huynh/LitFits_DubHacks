import { describe, expect, it } from 'vitest';
import { addLikedLink } from './liked-garments';

describe('addLikedLink', () => {
  it('keeps one cart row per product URL', () => {
    const first = {
      id: '1',
      productUrl: 'https://shop.example/coat',
      name: 'Coat',
      garmentImageUrl: 'https://cdn.example/coat.jpg',
      retailer: 'shop',
      addedAt: '2026-01-01T00:00:00.000Z',
    };
    const again = { ...first, id: '2', name: 'Coat v2' };
    const other = { ...first, id: '3', productUrl: 'https://shop.example/tee', name: 'Tee' };
    const cart = addLikedLink(addLikedLink([first], again), other);
    expect(cart.map((item) => item.productUrl)).toEqual([
      'https://shop.example/tee',
      'https://shop.example/coat',
    ]);
    expect(cart.find((item) => item.productUrl.endsWith('/coat'))?.name).toBe('Coat v2');
  });
});
