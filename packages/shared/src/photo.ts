import { z } from 'zod';
import { FALLBACK_HEAD_BAND, HEAD_BOX } from './fit-rules';

// Normalized (0..1) rectangle in image coordinates.
export const NormBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().gt(0).max(1),
    h: z.number().gt(0).max(1),
  })
  .refine((b) => b.x + b.w <= 1.0001 && b.y + b.h <= 1.0001, 'box must lie inside the image');
export type NormBox = z.infer<typeof NormBoxSchema>;

export type Landmark = { x: number; y: number; visibility?: number };

// MediaPipe Pose indices: 0 nose, 1–6 eyes, 7–8 ears, 9–10 mouth, 11–12 shoulders.
const FACE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const clamp = (v: number) => Math.min(1, Math.max(0, v));

// Box covering the whole head (hair to neck) from pose landmarks, or null when
// the face isn't confidently visible.
export function headBoxFromLandmarks(landmarks: Landmark[]): NormBox | null {
  const visible = (i: number) => {
    const l = landmarks[i];
    return l && (l.visibility ?? 1) >= HEAD_BOX.minVisibility ? l : undefined;
  };
  const face = FACE.map(visible).filter((l): l is Landmark => Boolean(l));
  const nose = visible(0);
  if (!nose || face.length < 3) return null;

  const span = (a: number, b: number) => {
    const p = landmarks[a];
    const q = landmarks[b];
    return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : 0;
  };
  const s = Math.max(span(7, 8), span(11, 12) / 2);
  if (s <= 0) return null;

  const top = Math.min(...face.map((l) => l.y)) - HEAD_BOX.aboveFaceScale * s;
  const mouthY = Math.max(...[visible(9), visible(10), nose].filter(Boolean).map((l) => l!.y));
  const bottom = mouthY + HEAD_BOX.belowMouthScale * s;
  const left = nose.x - (HEAD_BOX.widthScale * s) / 2;
  const right = nose.x + (HEAD_BOX.widthScale * s) / 2;

  const box = { x: clamp(left), y: clamp(top), w: 0, h: 0 };
  box.w = clamp(right) - box.x;
  box.h = clamp(bottom) - box.y;
  return box.w > 0 && box.h > 0 ? box : null;
}

export const FALLBACK_HEAD_BOX: NormBox = { x: 0, y: 0, w: 1, h: FALLBACK_HEAD_BAND };
