import { describe, expect, it } from 'vitest';
import { FALLBACK_HEAD_BOX, NormBoxSchema, headBoxFromLandmarks, type Landmark } from './photo';

// A standing figure: head near the top centre, shoulders below.
function pose(over: Partial<Record<number, Landmark>> = {}): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.6, visibility: 0.9 }));
  const set: Record<number, Landmark> = {
    0: { x: 0.5, y: 0.12 }, // nose
    2: { x: 0.49, y: 0.1 },
    5: { x: 0.51, y: 0.1 }, // eyes
    7: { x: 0.47, y: 0.11 },
    8: { x: 0.53, y: 0.11 }, // ears: span 0.06
    9: { x: 0.49, y: 0.14 },
    10: { x: 0.51, y: 0.14 }, // mouth
    11: { x: 0.42, y: 0.22 },
    12: { x: 0.58, y: 0.22 }, // shoulders: span 0.16 → half 0.08
    ...over,
  };
  for (const [i, l] of Object.entries(set)) lm[Number(i)] = { visibility: 0.9, ...l };
  return lm;
}

describe('headBoxFromLandmarks', () => {
  it('covers the head from above the eyes to below the mouth', () => {
    const box = headBoxFromLandmarks(pose())!;
    // s = max(0.06, 0.08) = 0.08; width 2.4 s, top 0.10 − 1.6 s, bottom 0.14 + 1.0 s
    expect(box.x).toBeCloseTo(0.5 - 0.096, 6);
    expect(box.w).toBeCloseTo(0.192, 6);
    expect(box.y).toBeCloseTo(0, 6); // 0.10 − 0.128 clamps to the top edge
    expect(box.h).toBeCloseTo(0.22, 6);
    expect(NormBoxSchema.safeParse(box).success).toBe(true);
  });

  it('returns null when the face is not visible', () => {
    const hidden = pose(
      Object.fromEntries(
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => [i, { x: 0.5, y: 0.1, visibility: 0.1 }]),
      ),
    );
    expect(headBoxFromLandmarks(hidden)).toBeNull();
    expect(headBoxFromLandmarks([])).toBeNull();
  });

  it('clamps boxes that run off the image edge', () => {
    const box = headBoxFromLandmarks(pose({ 0: { x: 0.02, y: 0.12 } }))!;
    expect(box.x).toBe(0);
    expect(NormBoxSchema.safeParse(box).success).toBe(true);
  });

  it('has a full-width top band as the fallback', () => {
    expect(FALLBACK_HEAD_BOX).toEqual({ x: 0, y: 0, w: 1, h: 0.22 });
  });
});
