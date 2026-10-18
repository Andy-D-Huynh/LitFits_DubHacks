import { FitDirectRequestSchema } from '@fitmirror/shared';
import { describe, expect, it } from 'vitest';
import { fitDirect } from './direct';

const garment = {
  sourceUrl: 'https://shop.test/p/tee?utm_source=x',
  category: 'top',
  sizeChart: {
    unit: 'in',
    rows: [
      { label: 'S', chest: [34, 36] },
      { label: 'M', chest: [38, 40] },
      { label: 'L', chest: [42, 44] },
    ],
  },
  chartType: 'body',
  measurementBasis: 'circumference',
};

const parse = (body: unknown) => FitDirectRequestSchema.parse(body);

describe('fitDirect', () => {
  it('converts an inch chart and recommends a size', () => {
    const result = fitDirect(parse({ measurements: { chest: 99 }, garment }));
    expect(result.recommendedSize).toBe('M');
    expect(result.perSize.map((s) => s.size)).toEqual(['S', 'M', 'L']);
  });

  it('gives the same garmentId for the same product page, ignoring tracking params', () => {
    const a = fitDirect(parse({ measurements: { chest: 99 }, garment }));
    const b = fitDirect(
      parse({
        measurements: { chest: 99 },
        garment: { ...garment, sourceUrl: 'https://shop.test/p/tee' },
      }),
    );
    expect(a.garmentId).toBe(b.garmentId);
  });

  it('still answers without a URL', () => {
    const { sourceUrl: _, ...noUrl } = garment;
    expect(fitDirect(parse({ measurements: { chest: 99 }, garment: noUrl })).garmentId).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it('rejects measurements outside the profile ranges and unknown categories', () => {
    expect(FitDirectRequestSchema.safeParse({ measurements: { chest: 5 }, garment }).success).toBe(
      false,
    );
    expect(
      FitDirectRequestSchema.safeParse({
        measurements: { chest: 99 },
        garment: { ...garment, category: 'footwear' },
      }).success,
    ).toBe(false);
  });
});
