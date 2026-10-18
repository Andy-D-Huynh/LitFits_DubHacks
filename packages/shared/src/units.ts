import type { DimValue, LengthUnit, RawSizeChart, SizeChart, SizeRow } from './types';

// Exact by definition, not a tunable, so it lives here rather than fit-rules.ts.
export const CM_PER_INCH = 2.54;

export function inToCm(inches: number): number {
  return inches * CM_PER_INCH;
}

export function cmToIn(cm: number): number {
  return cm / CM_PER_INCH;
}

export function toCm(value: number, unit: LengthUnit): number {
  return unit === 'in' ? inToCm(value) : value;
}

function dimValueToCm(value: DimValue, unit: LengthUnit): DimValue {
  return typeof value === 'number'
    ? toCm(value, unit)
    : [toCm(value[0], unit), toCm(value[1], unit)];
}

// Converts an extracted chart to cm. Flat-vs-circumference doubling is the
// fit engine's job, not this one.
export function normalizeSizeChart(raw: RawSizeChart): SizeChart {
  return {
    unit: 'cm',
    rows: raw.rows.map((row) => {
      const out: SizeRow = { label: row.label };
      for (const [key, value] of Object.entries(row)) {
        if (key === 'label' || value === undefined || typeof value === 'string') continue;
        out[key as Exclude<keyof SizeRow, 'label'>] = dimValueToCm(value, raw.unit);
      }
      return out;
    }),
  };
}
