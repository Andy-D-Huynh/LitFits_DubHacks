import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyTryOnResult,
  loadFigure,
  removeGarment,
  setModelPhoto,
  toggleCart,
} from './storage';
import { STORAGE_KEY } from './types';

describe('storage garment management', () => {
  let mockStore: Record<string, unknown> = {};

  beforeEach(() => {
    mockStore = {};
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: {
        local: {
          get: async (key: string) => ({ [key]: mockStore[key] }),
          set: async (items: Record<string, unknown>) => {
            Object.assign(mockStore, items);
          },
        },
      },
    };
  });

  it('adds a tried-on garment to liked and slots, and removes it cleanly', async () => {
    await setModelPhoto('data:image/jpeg;base64,basephoto', null);

    const likedItem = {
      id: 'g-1',
      productUrl: 'https://zara.com/jacket',
      name: 'Puffer Jacket',
      garmentImageUrl: 'https://zara.com/img.jpg',
      retailer: 'Zara',
      addedAt: new Date().toISOString(),
      inCart: false,
    };

    const updated = await applyTryOnResult('data:image/jpeg;base64,renderlook', likedItem, 'outerwear');
    expect(updated.avatarImageUrl).toBe('data:image/jpeg;base64,renderlook');
    expect(updated.liked.length).toBe(1);
    expect(updated.liked[0]?.name).toBe('Puffer Jacket');
    expect(updated.slots.outerwear?.name).toBe('Puffer Jacket');

    // Toggle inCart
    const withCart = await toggleCart('g-1');
    expect(withCart.liked[0]?.inCart).toBe(true);

    // Remove garment
    const afterRemove = await removeGarment('g-1');
    expect(afterRemove.liked.length).toBe(0);
    expect(afterRemove.slots.outerwear).toBeNull();
    // Since no garments remain, avatarImageUrl resets to null so it falls back to modelImage
    expect(afterRemove.avatarImageUrl).toBeNull();
    expect(afterRemove.modelImage).toBe('data:image/jpeg;base64,basephoto');
  });

  it('marks and consumes pending cart additions reliably', async () => {
    const { markPendingCartAdd, consumePendingCartAdd } = await import('./storage');

    await markPendingCartAdd('https://shop.diesel.com/en-us/jackets/p-1234.html');

    // Mismatched site should not consume
    const wrongSite = await consumePendingCartAdd('https://zara.com/jacket');
    expect(wrongSite).toBe(false);

    // Matching site and path (including prefix or www variations)
    const matched = await consumePendingCartAdd('https://www.shop.diesel.com/en-us/jackets/p-1234.html?ref=cart');
    expect(matched).toBe(true);

    // After consumption, subsequent calls should return false
    const consumedAgain = await consumePendingCartAdd('https://shop.diesel.com/en-us/jackets/p-1234.html');
    expect(consumedAgain).toBe(false);
  });
});

