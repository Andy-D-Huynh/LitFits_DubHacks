import { describe, expect, it } from 'vitest';
import {
  GarmentFixtureSchema,
  IngestRequestSchema,
  MeasurementsSchema,
  SizeChartSchema,
  SizeRowSchema,
} from './schemas';

describe('SizeRowSchema', () => {
  it('accepts garment measures and body ranges', () => {
    expect(SizeRowSchema.safeParse({ label: 'M', chest: 104, waist: [80, 84] }).success).toBe(true);
  });

  it('rejects inverted ranges, non-positive values, and unknown labels', () => {
    expect(SizeRowSchema.safeParse({ label: 'M', waist: [84, 80] }).success).toBe(false);
    expect(SizeRowSchema.safeParse({ label: 'M', chest: 0 }).success).toBe(false);
    expect(SizeRowSchema.safeParse({ label: '', chest: 100 }).success).toBe(false);
  });
});

describe('SizeChartSchema', () => {
  it('only accepts cm (inches must be normalized first)', () => {
    expect(SizeChartSchema.safeParse({ unit: 'in', rows: [{ label: 'S' }] }).success).toBe(false);
    expect(SizeChartSchema.safeParse({ unit: 'cm', rows: [] }).success).toBe(false);
  });
});

describe('MeasurementsSchema', () => {
  it('allows partial measurements but rejects unknown keys', () => {
    expect(MeasurementsSchema.safeParse({ chest: 98 }).success).toBe(true);
    expect(MeasurementsSchema.safeParse({ neck: 38 }).success).toBe(false);
  });
});

describe('IngestRequestSchema', () => {
  const base = { source: 'extension', url: 'https://example.com/p/1' };

  it('defaults imageUrls to an empty array', () => {
    expect(IngestRequestSchema.parse(base).imageUrls).toEqual([]);
  });

  it('caps chartHtml at 20,000 chars', () => {
    expect(IngestRequestSchema.safeParse({ ...base, chartHtml: 'x'.repeat(20_000) }).success).toBe(
      true,
    );
    expect(IngestRequestSchema.safeParse({ ...base, chartHtml: 'x'.repeat(20_001) }).success).toBe(
      false,
    );
  });

  it('caps pageText at 8000 chars and images at 8', () => {
    expect(IngestRequestSchema.safeParse({ ...base, pageText: 'x'.repeat(8001) }).success).toBe(
      false,
    );
    const imageUrls = Array.from({ length: 9 }, (_, i) => `https://example.com/${i}.jpg`);
    expect(IngestRequestSchema.safeParse({ ...base, imageUrls }).success).toBe(false);
  });
});

describe('GarmentFixtureSchema', () => {
  it('requires the placeholder flag and fixture extraction method', () => {
    const fixture = {
      id: '00000000-0000-4000-8000-000000000001',
      sourceUrl: null,
      retailer: null,
      brand: null,
      name: 'Placeholder tee',
      category: 'top',
      imageUrls: [],
      primaryImageUrl: null,
      primaryColor: null,
      priceCents: null,
      currency: null,
      fitType: 'regular',
      stretch: 'none',
      chartType: 'garment',
      measurementBasis: 'flat',
      sizeChart: { unit: 'cm', rows: [{ label: 'M', chest: 52 }] },
      extractionMethod: 'fixture',
      extractionConfidence: null,
      placeholder: true,
    };
    expect(GarmentFixtureSchema.safeParse(fixture).success).toBe(true);
    const { placeholder: _omit, ...withoutFlag } = fixture;
    expect(GarmentFixtureSchema.safeParse(withoutFlag).success).toBe(false);
    expect(GarmentFixtureSchema.safeParse({ ...fixture, extractionMethod: 'dom' }).success).toBe(
      false,
    );
  });
});
