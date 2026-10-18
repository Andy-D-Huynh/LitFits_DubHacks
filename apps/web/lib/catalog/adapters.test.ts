import { describe, expect, it } from 'vitest';
import {
  clothingProductToWornGarment,
  type ClothingProduct,
  type RetailerAdapter,
} from '../figure/contracts';
import { demoCatalogAdapter } from './demo-catalog';
import { searchAdapters, searchCatalog, listAdapters } from './registry';

const CATEGORIES = ['top', 'bottom', 'outerwear', 'dress'] as const;

describe('catalog adapters', () => {
  it('merges demo fixtures from every registered source', async () => {
    const adapters = listAdapters();
    expect(adapters.map((adapter) => adapter.sourceId)).toEqual(['demo-catalog', 'demo-outlet']);
    expect(adapters.every((adapter) => adapter.kind === 'demo')).toBe(true);

    const products = await searchCatalog({});
    const demo = products.filter((product) => product.source === 'demo-catalog');
    const outlet = products.filter((product) => product.source === 'demo-outlet');

    expect(demo.length).toBeGreaterThanOrEqual(8);
    expect(new Set(demo.map((product) => product.brand)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(demo.map((product) => product.category))).toEqual(new Set(CATEGORIES));
    expect(outlet.length).toBeGreaterThanOrEqual(2);

    for (const product of products) {
      expect(product.sample).toBe(true);
      expect(product.productUrl).toBe(`/shop#${product.id}`);
      expect(product.imageUrl.startsWith('data:image/svg+xml')).toBe(true);
      expect(product.transparentImageUrl?.startsWith('data:image/svg+xml')).toBe(true);
      expect(product.price?.currency).toBe('USD');
      expect(product.productUrl.startsWith('http')).toBe(false);
    }
  });

  it('drops invalid products and keeps valid rows from the same search', async () => {
    const mixed: RetailerAdapter = {
      sourceId: 'mixed',
      label: 'Mixed',
      kind: 'demo',
      async search() {
        return [
          { id: '', source: 'mixed', title: 'Missing id', brand: 'Northline', category: 'top', imageUrl: 'x', productUrl: '/shop#x' },
          {
            id: 'kept',
            source: 'mixed',
            title: 'Kept Tee',
            brand: 'Northline',
            category: 'top',
            imageUrl: 'data:image/svg+xml,kept',
            productUrl: '/shop#kept',
            sample: true,
          },
        ] as ClothingProduct[];
      },
    };

    const products = await searchAdapters([mixed], {});
    expect(products.map((product) => product.id)).toEqual(['kept']);
  });

  it('keeps the other adapter when one adapter throws', async () => {
    const failing: RetailerAdapter = {
      sourceId: 'down',
      label: 'Down',
      kind: 'demo',
      search() {
        return Promise.reject(new Error('retailer unavailable'));
      },
    };

    const products = await searchAdapters([failing, demoCatalogAdapter], {});
    expect(products.length).toBeGreaterThanOrEqual(8);
    expect(products.every((product) => product.source === 'demo-catalog')).toBe(true);
    await expect(searchAdapters([failing], { text: 'coat' })).resolves.toEqual([]);
  });

  it('keeps a stable worn id for the same product id and source', async () => {
    const [product] = await searchCatalog({});
    expect(product).toBeDefined();
    if (!product) return;

    const first = clothingProductToWornGarment(product, { size: 'M' });
    const second = clothingProductToWornGarment(product, { size: 'L' });
    expect(first.id).toBe(second.id);
    expect(first.id).toBe(`${product.source}:${product.id}`);
    expect(first.productId).toBe(product.id);
    expect(first.source).toBe(product.source);
  });
});
