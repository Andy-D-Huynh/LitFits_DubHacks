import type { Category, Dim, FitType, Stretch } from './types';

// Every tunable number for the fit engine. See docs/fit-engine.md.

export type Band = readonly [min: number, max: number];

// Ease = garment − body, cm of circumference.
export const TOP_EASE: Record<'chest' | 'waist' | 'shoulder', Record<FitType, Band>> = {
  chest: { slim: [4, 8], regular: [8, 16], relaxed: [16, 26] },
  waist: { slim: [2, 8], regular: [6, 18], relaxed: [14, 28] },
  shoulder: { slim: [-2, 2], regular: [-1, 3], relaxed: [-1, 8] },
};

export const BOTTOM_HIP_EASE: Record<FitType, Band> = {
  slim: [2, 6],
  regular: [4, 10],
  relaxed: [10, 20],
};

export const BOTTOM_WAIST_EASE: Band = [0, 4];
// Replaces BOTTOM_WAIST_EASE when the garment has any stretch; not reduced further.
export const BOTTOM_WAIST_EASE_STRETCH: Band = [-4, 2];
// Garment inseam − body inseam. Not an ease band, so stretch does not change it.
export const BOTTOM_INSEAM_DIFF: Band = [-3, 3];

export const STRETCH_MIN_EASE_REDUCTION_CM: Record<Stretch, number> = { none: 0, low: 2, high: 5 };

// Raw weights; the engine renormalizes over the dims actually evaluated.
// Length is never scored; sleeve is note-only.
export const WEIGHTS: Record<Category, Partial<Record<Dim, number>>> = {
  top: { chest: 0.5, shoulder: 0.25, waist: 0.1 },
  outerwear: { chest: 0.5, shoulder: 0.25, waist: 0.1 },
  bottom: { waist: 0.4, hip: 0.35, inseam: 0.25 },
  dress: { chest: 0.5, shoulder: 0.25, waist: 0.1, hip: 0.35 },
};

export const NOTE_ONLY_DIMS: readonly Dim[] = ['sleeve'];
export const CRITICAL_DIMS: readonly Dim[] = ['chest', 'waist', 'hip'];
export const FLAT_DOUBLED_DIMS: readonly Dim[] = ['chest', 'waist', 'hip'];

export const MAIN_DIM: Record<Category, Dim> = {
  top: 'chest',
  outerwear: 'chest',
  dress: 'chest',
  bottom: 'waist',
};

// Critical dims a size needs evaluated before it can be recommended.
export const MIN_CRITICAL_DIMS: Record<Category, number> = {
  top: 1,
  outerwear: 1,
  bottom: 2,
  dress: 2,
};
// Tops and outerwear specifically need chest (not just any one critical dim).
export const REQUIRED_DIMS: Partial<Record<Category, readonly Dim[]>> = {
  top: ['chest'],
  outerwear: ['chest'],
};

export const SCORE_FALLOFF_CM = 10;
export const GOOD_SCORE_THRESHOLD = 0.8;
export const TIGHT_MARGIN_CM = 3;
export const LOOSE_MARGIN_CM = 6;
export const SCORE_TIE_EPSILON = 1e-9;

// Outerwear is worn over other layers, so its garment-chart bands shift up.
// Body-chart outerwear is unaffected (the brand's ranges already allow for it).
export const OUTERWEAR_EASE_OFFSET_CM: Record<'chest' | 'waist' | 'shoulder', number> = {
  chest: 6,
  waist: 6,
  shoulder: 1,
};

// Recommendation ranking: overall verdict first (a size you can't get into is
// worse than one that's roomy), then whether any critical dim is tight, then score.
export const VERDICT_RANK: Record<'good' | 'loose' | 'tight' | 'unknown', number> = {
  good: 0,
  loose: 1,
  tight: 2,
  unknown: 3,
};

// Plausible adult ranges (cm) for manual entry and photo estimates (docs/measurement.md).
// Values outside are rejected as typos rather than fitted.
export const HEIGHT_RANGE_CM: Band = [120, 230];
export const MEASUREMENT_RANGES_CM: Record<
  'shoulder_width' | 'chest' | 'waist' | 'hip' | 'inseam' | 'arm_length',
  Band
> = {
  shoulder_width: [30, 65],
  chest: [60, 170],
  waist: [45, 170],
  hip: [60, 180],
  inseam: [50, 110],
  arm_length: [40, 90],
};

// Head box for the faceless try-on photo (docs/tryon.md), in units of the
// head scale s = the wider of ear-to-ear span and half the shoulder span.
export const HEAD_BOX = {
  widthScale: 2.4, // box width = widthScale × s, centred on the nose
  aboveFaceScale: 1.6, // top of head: this far above the highest face landmark
  belowMouthScale: 1.0, // chin and neck: this far below the mouth
  minVisibility: 0.5,
} as const;
// Used when no pose is found: blur this top fraction of the photo instead.
export const FALLBACK_HEAD_BAND = 0.22;
