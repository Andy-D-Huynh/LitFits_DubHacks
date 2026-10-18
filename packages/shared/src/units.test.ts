import { describe, expect, it } from 'vitest';
import { cmToIn, inToCm, normalizeSizeChart, toCm } from './units';

describe('unit conversion', () => {
  it('converts inches to cm exactly', () => {
    expect(inToCm(1)).toBe(2.54);
    expect(inToCm(40)).toBeCloseTo(101.6, 10);
  });

  it('round-trips cm -> in -> cm', () => {
    expect(inToCm(cmToIn(97))).toBeCloseTo(97, 10);
  });

  it('toCm leaves cm values unchanged', () => {
    expect(toCm(88, 'cm')).toBe(88);
    expect(toCm(10, 'in')).toBeCloseTo(25.4, 10);
  });
});

describe('normalizeSizeChart', () => {
  it('converts garment measures and body ranges from inches', () => {
    const chart = normalizeSizeChart({
      unit: 'in',
      rows: [{ label: 'M', chest: 40, waist: [30, 32] }],
    });
    expect(chart.unit).toBe('cm');
    expect(chart.rows[0]?.label).toBe('M');
    expect(chart.rows[0]?.chest).toBeCloseTo(101.6, 10);
    const waist = chart.rows[0]?.waist as [number, number];
    expect(waist[0]).toBeCloseTo(76.2, 10);
    expect(waist[1]).toBeCloseTo(81.28, 10);
  });

  it('passes cm charts through unchanged', () => {
    const rows = [{ label: 'S', chest: 92, hip: [88, 92] as [number, number] }];
    expect(normalizeSizeChart({ unit: 'cm', rows })).toEqual({ unit: 'cm', rows });
  });

  it('does not add dims that were absent', () => {
    const chart = normalizeSizeChart({ unit: 'in', rows: [{ label: 'L', chest: 44 }] });
    expect(Object.keys(chart.rows[0] ?? {})).toEqual(['label', 'chest']);
  });
});
