import type { Dim, MeasurementKey, Measurements } from './types';

// The single mapping between profile measurement keys and size-chart dims.
// The fit engine and measure.ts both go through this module.

export const DIM_FOR_MEASUREMENT: Record<MeasurementKey, Dim> = {
  shoulder_width: 'shoulder',
  chest: 'chest',
  waist: 'waist',
  hip: 'hip',
  inseam: 'inseam',
  arm_length: 'sleeve',
};

// `length` is a garment-only dim: no body measurement corresponds to it.
export const MEASUREMENT_FOR_DIM: Record<Dim, MeasurementKey | null> = {
  shoulder: 'shoulder_width',
  chest: 'chest',
  waist: 'waist',
  hip: 'hip',
  inseam: 'inseam',
  length: null,
  sleeve: 'arm_length',
};

export function bodyCmForDim(measurements: Measurements, dim: Dim): number | undefined {
  const key = MEASUREMENT_FOR_DIM[dim];
  return key === null ? undefined : measurements[key];
}
