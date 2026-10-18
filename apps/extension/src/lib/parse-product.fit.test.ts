import { describe, expect, it } from 'vitest';
import { parsePageProduct, type PageSnapshot } from './parse-product';

// Size-chart capture for POST /api/fit/direct (kept apart from the main
// parse-product tests).

const base: PageSnapshot = {
  url: 'https://shop.example/products/tee',
  title: 'Slim fit tee',
  jsonLdTexts: [],
  metas: [],
  images: [],
};

describe('parsePageProduct fitGarment', () => {
  it('reads the size chart from the page tables, with the unit from nearby text', () => {
    const product = parsePageProduct({
      ...base,
      tablesHtml:
        '<table><tr><th>Size</th><th>Chest</th></tr><tr><td>S</td><td>88-92</td></tr><tr><td>M</td><td>96-100</td></tr></table>',
      tablesText: 'Size guide. Body measurements in cm.',
    });
    expect(product.fitGarment).toMatchObject({
      sourceUrl: 'https://shop.example/products/tee',
      category: 'top',
      fitType: 'slim',
      chartType: 'body',
      sizeChart: { unit: 'cm', rows: [{ label: 'S' }, { label: 'M' }] },
    });
  });

  it('is null when the page has no size chart', () => {
    expect(parsePageProduct(base).fitGarment).toBeNull();
  });
});
