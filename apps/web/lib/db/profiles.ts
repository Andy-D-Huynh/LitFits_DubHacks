import { ProfileSchema, type Profile, type ProfileInput } from '@fitmirror/shared';

// Maps between the profiles table (snake_case) and the shared Profile type.

export type ProfileRow = {
  id: string;
  user_id: string;
  height_cm: number | string; // Postgres numeric arrives as a string
  fit_preference: Profile['fitPreference'];
  measurements: Profile['measurements'];
  measurement_source: Profile['measurementSource'];
  confidence: Profile['confidence'];
  model_photo_path: string | null;
  face_opt_in: boolean;
  created_at: string;
};

export function rowToProfile(row: ProfileRow): Profile {
  return ProfileSchema.parse({
    id: row.id,
    userId: row.user_id,
    heightCm: Number(row.height_cm),
    fitPreference: row.fit_preference,
    measurements: row.measurements,
    measurementSource: row.measurement_source,
    confidence: row.confidence,
    modelPhotoPath: row.model_photo_path,
    faceOptIn: row.face_opt_in,
    createdAt: row.created_at,
  });
}

// Manual entry: every provided key is marked manual (docs/measurement.md: manual overrides photo).
export function profileInputToRow(input: ProfileInput) {
  const keys = Object.keys(input.measurements) as (keyof ProfileInput['measurements'])[];
  return {
    height_cm: input.heightCm,
    fit_preference: input.fitPreference,
    measurements: input.measurements,
    measurement_source: Object.fromEntries(keys.map((k) => [k, 'manual'])),
  };
}
