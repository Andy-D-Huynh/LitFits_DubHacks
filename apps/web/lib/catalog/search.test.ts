import { describe, expect, it } from 'vitest';
import type { ClothingProduct } from '../figure/contracts';
import { filterProducts } from './search';

function item(
  overrides: Partial<ClothingProduct> & Pick<ClothingProduct, 'id' | 'title' | 'category'>,
): ClothingProduct {
  return {
    source: 'demo-catalog',
    brand: 'Northline',
    imageUrl: 'data:image/svg+xml,x',
    productUrl: `/shop#${overrides.id}`,
    sample: true,
    ...overrides,
  };
}

const catalog: ClothingProduct[] = [
  item({
    id: 'tee',
    title: 'Box Tee',
    brand: 'Atelier Sample',
    category: 'top',
    color: 'Navy',
    availableSizes: ['S', 'M'],
    price: { amount: 44, currency: 'USD' },
  }),
  item({
    id: 'trouser',
    title: 'Wool Trouser',
    brand: 'Harbor Knit',
    category: 'bottom',
    color: 'Charcoal',
    availableSizes: ['30', '32'],
    price: { amount: 98, currency: 'USD' },
  }),
  item({
    id: 'coat',
    title: 'Studio Coat',
    brand: 'Northline',
    category: 'outerwear',
    color: 'Camel',
    availableSizes: ['M', 'L'],
    price: { amount: 210, currency: 'USD' },
  }),
  item({
    id: 'dress',
    title: 'Column Dress',
    brand: 'Harbor Knit',
    category: 'dress',
    color: 'Black',
    availableSizes: ['S'],
    price: { amount: 148, currency: 'USD' },
  }),
  item({
    id: 'unpriced',
    title: 'Sample Shell',
    brand: 'Northline',
    category: 'top',
    color: 'White',
    availableSizes: ['M'],
  }),
  item({
    id: 'unsized',
    title: 'One Size Cape',
    brand: 'Atelier Sample',
    category: 'outerwear',
    color: 'Olive',
    price: { amount: 80, currency: 'USD' },
  }),
];

describe('filterProducts', () => {
  it('filters by category and ignores all or empty category', () => {
    expect(filterProducts(catalog, { category: 'dress' }).map((p) => p.id)).toEqual(['dress']);
    expect(filterProducts(catalog, { category: 'all' })).toHaveLength(catalog.length);
    expect(filterProducts(catalog, {})).toHaveLength(catalog.length);
  });

  it('matches brand with case-insensitive equality, not a substring', () => {
    expect(filterProducts(catalog, { brand: 'harbor knit' }).map((p) => p.id)).toEqual([
      'trouser',
      'dress',
    ]);
    expect(filterProducts(catalog, { brand: 'Harbor' })).toEqual([]);
  });

  it('keeps products whose sizes include the requested size', () => {
    expect(filterProducts(catalog, { size: '32' }).map((p) => p.id)).toEqual(['trouser']);
    expect(filterProducts(catalog, { size: 'M' }).map((p) => p.id)).toEqual(['tee', 'coat', 'unpriced']);
  });

  it('excludes products with no sizes when a size filter is set', () => {
    expect(filterProducts(catalog, { size: 'M' }).some((p) => p.id === 'unsized')).toBe(false);
  });

  it('matches color with case-insensitive equality', () => {
    expect(filterProducts(catalog, { color: 'navy' }).map((p) => p.id)).toEqual(['tee']);
    expect(filterProducts(catalog, { color: 'nav' })).toEqual([]);
  });

  it('applies inclusive price bounds and drops products with no price', () => {
    expect(filterProducts(catalog, { minPrice: 90, maxPrice: 150 }).map((p) => p.id)).toEqual([
      'trouser',
      'dress',
    ]);
    expect(filterProducts(catalog, { maxPrice: 44 }).map((p) => p.id)).toEqual(['tee']);
    expect(filterProducts(catalog, { minPrice: 0 }).some((p) => p.id === 'unpriced')).toBe(false);
    expect(filterProducts(catalog, {}).some((p) => p.id === 'unpriced')).toBe(true);
  });

  it('matches text against title, brand, color, and category', () => {
    expect(filterProducts(catalog, { text: 'wool' }).map((p) => p.id)).toEqual(['trouser']);
    expect(filterProducts(catalog, { text: 'ATELIER' }).map((p) => p.id)).toEqual(['tee', 'unsized']);
    expect(filterProducts(catalog, { text: 'camel' }).map((p) => p.id)).toEqual(['coat']);
    expect(filterProducts(catalog, { text: 'outerwear' }).map((p) => p.id)).toEqual(['coat', 'unsized']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterProducts(catalog, { text: 'sequin gown', category: 'top' })).toEqual([]);
  });
});
