import { describe, expect, it } from 'vitest';
import { DIM_FOR_MEASUREMENT, MEASUREMENT_FOR_DIM, bodyCmForDim } from './dims';
import { DimSchema, MeasurementKeySchema } from './schemas';

describe('dim mapping', () => {
  it('maps every measurement key to a dim and back', () => {
    for (const key of MeasurementKeySchema.options) {
      expect(MEASUREMENT_FOR_DIM[DIM_FOR_MEASUREMENT[key]]).toBe(key);
    }
  });

  it('covers every dim, with length as the only garment-only dim', () => {
    const unmapped = DimSchema.options.filter((d) => MEASUREMENT_FOR_DIM[d] === null);
    expect(unmapped).toEqual(['length']);
  });

  it('reads body values through the mapping', () => {
    const m = { shoulder_width: 45, arm_length: 61, chest: 98 };
    expect(bodyCmForDim(m, 'shoulder')).toBe(45);
    expect(bodyCmForDim(m, 'sleeve')).toBe(61);
    expect(bodyCmForDim(m, 'chest')).toBe(98);
    expect(bodyCmForDim(m, 'waist')).toBeUndefined();
    expect(bodyCmForDim(m, 'length')).toBeUndefined();
  });
});
