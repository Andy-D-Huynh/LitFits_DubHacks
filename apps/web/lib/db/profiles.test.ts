import { ProfileInputSchema } from '@fitmirror/shared';
import { describe, expect, it } from 'vitest';
import { profileInputToRow, rowToProfile } from './profiles';

const row = {
  id: '00000000-0000-4000-8000-0000000000d1',
  user_id: '00000000-0000-4000-8000-0000000000d0',
  height_cm: '178.5',
  fit_preference: 'snug' as const,
  measurements: { chest: 98 },
  measurement_source: { chest: 'manual' as const },
  confidence: null,
  model_photo_path: null,
  face_opt_in: false,
  created_at: '2026-10-17T00:00:00+00:00',
};

describe('profile row mapping', () => {
  it('maps a row and coerces numeric height', () => {
    expect(rowToProfile(row)).toMatchObject({ heightCm: 178.5, fitPreference: 'snug' });
  });

  it('marks every provided measurement as manual', () => {
    const input = ProfileInputSchema.parse({
      heightCm: 170,
      measurements: { chest: 90, inseam: 78 },
    });
    expect(profileInputToRow(input)).toEqual({
      height_cm: 170,
      fit_preference: 'regular',
      measurements: { chest: 90, inseam: 78 },
      measurement_source: { chest: 'manual', inseam: 'manual' },
    });
  });
});

describe('ProfileInputSchema', () => {
  it('rejects implausible values and unknown keys', () => {
    expect(ProfileInputSchema.safeParse({ heightCm: 17, measurements: {} }).success).toBe(false);
    expect(
      ProfileInputSchema.safeParse({ heightCm: 170, measurements: { chest: 9.8 } }).success,
    ).toBe(false);
    expect(
      ProfileInputSchema.safeParse({ heightCm: 170, measurements: { neck: 38 } }).success,
    ).toBe(false);
  });
});
