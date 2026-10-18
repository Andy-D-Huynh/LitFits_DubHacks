import { GarmentSchema, IngestRequestSchema } from '@fitmirror/shared';
import { describe, expect, it } from 'vitest';
import { llmToNormalized, LlmGarmentSchema } from '../providers/llm/anthropic';
import {
  classifyCategory,
  classifyFit,
  classifyStretch,
  findProduct,
  MockNormalizer,
} from '../providers/llm/mock';
import { createRateLimiter } from '../rate-limit';
import { demoGarmentId, normalizedToGarment } from './build';
import { parseSizeChart, parseValue } from './parse-chart';
import { canonicalProductUrl } from './url';

describe('canonicalProductUrl', () => {
  it('drops hash, tracking params and trailing slash, keeps variant params', () => {
    expect(
      canonicalProductUrl('https://WWW.Shop.com/p/tee/?utm_source=x&color=red&fbclid=1#reviews'),
    ).toBe('https://www.shop.com/p/tee?color=red');
  });
});

describe('parseSizeChart', () => {
  const rowsHtml = `<table><tr><th>Size</th><th>Chest (cm)</th><th>Waist (cm)</th></tr>
    <tr><td>S</td><td>88-92</td><td>72&nbsp;–&nbsp;76</td></tr>
    <tr><td>M</td><td>96</td><td>80</td></tr></table>`;

  it('parses sizes as rows with ranges and single values', () => {
    expect(parseSizeChart(rowsHtml)).toEqual({
      chart: {
        unit: 'cm',
        rows: [
          { label: 'S', chest: [88, 92], waist: [72, 76] },
          { label: 'M', chest: 96, waist: 80 },
        ],
      },
      chartType: 'body',
      measurementBasis: 'circumference',
    });
  });

  it('parses sizes as columns and inches', () => {
    const html = `<table><tr><td></td><td>S</td><td>M</td></tr>
      <tr><td>Chest (inches)</td><td>19</td><td>20</td></tr></table>`;
    const r = parseSizeChart(html, 'Garment measurements, laid flat.');
    expect(r?.chart).toEqual({
      unit: 'in',
      rows: [
        { label: 'S', chest: 19 },
        { label: 'M', chest: 20 },
      ],
    });
    expect(r?.chartType).toBe('garment');
    expect(r?.measurementBasis).toBe('flat');
  });

  it('does not treat the word "in" as inches', () => {
    const html =
      '<table><tr><th>Size</th><th>Chest</th></tr><tr><td>M</td><td>96</td></tr></table>';
    expect(
      parseSizeChart(html, 'Model is 185 cm and wears size M in this photo.')?.chart.unit,
    ).toBe('cm');
  });

  it('returns null when the unit or the table is unclear', () => {
    const noUnit =
      '<table><tr><th>Size</th><th>Chest</th></tr><tr><td>M</td><td>96</td></tr></table>';
    expect(parseSizeChart(noUnit)).toBeNull();
    expect(parseSizeChart('<p>no table here</p>')).toBeNull();
  });

  it('parses value formats', () => {
    expect(parseValue('38')).toBe(38);
    expect(parseValue('38,5')).toBe(38.5);
    expect(parseValue('40 to 38')).toEqual([38, 40]);
    expect(parseValue('n/a')).toBeNull();
  });
});

describe('mock normalizer', () => {
  it('classifies category, fit and stretch from words', () => {
    expect(classifyCategory('Relaxed Linen Shirt')).toBe('top');
    expect(classifyCategory('Leather Chelsea Boots')).toBe('unsupported');
    expect(classifyCategory('Wool Overcoat')).toBe('outerwear');
    expect(classifyFit('An oversized fit')).toBe('relaxed');
    expect(classifyStretch('98% cotton, 2% elastane')).toBe('low');
    expect(classifyStretch('92% cotton, 8% spandex')).toBe('high');
    expect(classifyStretch('100% cotton')).toBe('none');
  });

  it('finds a Product node inside @graph', () => {
    expect(
      findProduct({ '@graph': [{ '@type': 'BreadcrumbList' }, { '@type': 'Product', name: 'X' }] }),
    ).toEqual({
      '@type': 'Product',
      name: 'X',
    });
  });

  it('normalizes a page from JSON-LD and the chart table', async () => {
    const input = IngestRequestSchema.parse({
      source: 'extension',
      url: 'https://shop.test/p/tee',
      jsonld: {
        '@type': 'Product',
        name: 'Slim Crew Tee',
        brand: { name: 'Acme' },
        image: ['https://shop.test/tee.jpg'],
        offers: { price: '25.00', priceCurrency: 'usd' },
      },
      chartHtml:
        '<table><tr><th>Size</th><th>Chest (cm)</th></tr><tr><td>M</td><td>96-100</td></tr></table>',
      pageText: '95% cotton 5% elastane',
    });
    const n = await new MockNormalizer().normalize(input);
    expect(n).toMatchObject({
      name: 'Slim Crew Tee',
      brand: 'Acme',
      category: 'top',
      fitType: 'slim',
      stretch: 'high',
      priceCents: 2500,
      currency: 'USD',
      chartType: 'body',
      primaryImageUrl: 'https://shop.test/tee.jpg',
      extractionMethod: 'dom',
      extractionConfidence: 0.9,
    });
  });
});

describe('LLM output conversion', () => {
  const input = IngestRequestSchema.parse({
    source: 'extension',
    url: 'https://shop.test/p/jean',
    imageUrls: ['https://shop.test/a.jpg', 'https://shop.test/b.jpg'],
  });
  const llm = LlmGarmentSchema.parse({
    name: 'Straight Jean',
    brand: null,
    category: 'bottom',
    fitType: 'regular',
    stretch: 'low',
    primaryColor: 'indigo',
    price: 79.5,
    currency: 'usd',
    primaryImageIndex: 1,
    sizeChart: {
      unit: 'in',
      chartType: 'body',
      measurementBasis: 'circumference',
      rows: [
        {
          label: '32',
          dims: [
            { dim: 'waist', min: 32, max: 33 },
            { dim: 'inseam', min: 32, max: null },
          ],
        },
      ],
    },
  });

  it('maps rows, prices and the chosen image', () => {
    const n = llmToNormalized(llm, input);
    expect(n.sizeChart).toEqual({
      unit: 'in',
      rows: [{ label: '32', waist: [32, 33], inseam: 32 }],
    });
    expect(n).toMatchObject({
      priceCents: 7950,
      currency: 'USD',
      primaryImageUrl: 'https://shop.test/b.jpg',
      extractionMethod: 'llm_html',
    });
  });

  it('drops an invalid chart instead of storing it', () => {
    const bad = { ...llm, sizeChart: { ...llm.sizeChart!, rows: [{ label: '', dims: [] }] } };
    expect(llmToNormalized(bad, input).sizeChart).toBeNull();
  });

  it('converts inches to cm when building the garment', () => {
    const g = normalizedToGarment(
      { ...llmToNormalized(llm, input), category: 'bottom' },
      'https://shop.test/p/jean',
    );
    expect(g.sizeChart?.unit).toBe('cm');
    expect(g.sizeChart?.rows[0]?.inseam).toBeCloseTo(81.28, 10);
    expect(g.retailer).toBe('shop.test');
    expect(
      GarmentSchema.safeParse({
        ...g,
        id: demoGarmentId('x'),
        createdAt: '2026-10-17T00:00:00+00:00',
      }).success,
    ).toBe(true);
  });
});

describe('rate limiter and demo ids', () => {
  it('allows `limit` hits per window', () => {
    const limit = createRateLimiter(2, 1000);
    expect(limit('ip', 0).ok).toBe(true);
    expect(limit('ip', 1).ok).toBe(true);
    expect(limit('ip', 2)).toEqual({ ok: false, retryAfterS: 1 });
    expect(limit('ip', 1000).ok).toBe(true);
  });

  it('derives a stable v4-shaped id from the URL', () => {
    expect(demoGarmentId('https://a.test/p')).toBe(demoGarmentId('https://a.test/p'));
    expect(demoGarmentId('https://a.test/p')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
