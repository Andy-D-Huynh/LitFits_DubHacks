import { toSilhouetteResult, type BodyReconstruction } from './contracts';
import { measureBody } from './proportions';
import { assessQuality, type QualityAssessmentInput } from './quality';
import type { Bounds, Point, ReconstructionQuality, SilhouetteResult } from '../opencv/types';

export type PersonMaskAnalysis = {
  /** Largest connected component. 1 = person. */
  mask: Uint8Array;
  bounds: Bounds | null;
  personArea: number;
  secondBlobArea: number;
};

/**
 * If the border is foreground and the center is empty, the threshold grabbed
 * the background. Flip it so 1 means the centered subject.
 */
export function orientForeground(mask: Uint8Array, width: number, height: number): Uint8Array {
  if (width <= 0 || height <= 0 || mask.length < width * height) return mask;
  let border = 0;
  let borderOn = 0;
  const touch = (index: number) => {
    border += 1;
    if (mask[index]) borderOn += 1;
  };
  for (let x = 0; x < width; x += 1) {
    touch(x);
    touch((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    touch(y * width);
    touch(y * width + width - 1);
  }
  const center = mask[Math.floor(height / 2) * width + Math.floor(width / 2)];
  if (border === 0 || borderOn / border < 0.85 || center) return mask;
  const inverted = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) inverted[i] = mask[i] ? 0 : 1;
  return inverted;
}

export function analyzePersonMask(mask: Uint8Array, width: number, height: number): PersonMaskAnalysis {
  const emptyMask = new Uint8Array(Math.max(0, width * height));
  const empty: PersonMaskAnalysis = {
    mask: emptyMask,
    bounds: null,
    personArea: 0,
    secondBlobArea: 0,
  };
  if (width <= 0 || height <= 0 || mask.length < width * height) return empty;

  const labels = new Int32Array(width * height);
  const stack: number[] = [];
  type Blob = { id: number; area: number; minX: number; minY: number; maxX: number; maxY: number };
  const blobs: Blob[] = [];
  let nextId = 0;

  for (let start = 0; start < width * height; start += 1) {
    if (!mask[start] || labels[start]) continue;
    nextId += 1;
    const id = nextId;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    labels[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const index = stack.pop()!;
      area += 1;
      const x = index % width;
      const y = (index - x) / width;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (!mask[next] || labels[next]) continue;
          labels[next] = id;
          stack.push(next);
        }
      }
    }
    blobs.push({ id, area, minX, minY, maxX, maxY });
  }

  if (blobs.length === 0) return empty;
  blobs.sort((a, b) => b.area - a.area);
  const best = blobs[0]!;
  const second = blobs[1];
  const person = new Uint8Array(width * height);
  for (let i = 0; i < labels.length; i += 1) {
    if (labels[i] === best.id) person[i] = 1;
  }
  return {
    mask: person,
    bounds: {
      x: best.minX,
      y: best.minY,
      width: best.maxX - best.minX + 1,
      height: best.maxY - best.minY + 1,
    },
    personArea: best.area,
    secondBlobArea: second?.area ?? 0,
  };
}

/** Left edge top-to-bottom, then right edge bottom-to-top, so the loop follows the visible body. */
export function traceOutline(mask: Uint8Array, width: number, height: number, bounds: Bounds): Point[] {
  if (width <= 0 || height <= 0 || !(bounds.width > 0) || !(bounds.height > 0)) return [];
  const minY = clamp(Math.floor(bounds.y), 0, height - 1);
  const maxY = clamp(Math.floor(bounds.y + bounds.height) - 1, 0, height - 1);
  const minX = clamp(Math.floor(bounds.x), 0, width - 1);
  const maxX = clamp(Math.floor(bounds.x + bounds.width) - 1, 0, width - 1);
  const points: Point[] = [];

  for (let y = minY; y <= maxY; y += 1) {
    const row = y * width;
    let left = minX;
    while (left <= maxX && !mask[row + left]) left += 1;
    if (left <= maxX) points.push({ x: left, y });
  }
  for (let y = maxY; y >= minY; y -= 1) {
    const row = y * width;
    let right = maxX;
    while (right >= minX && !mask[row + right]) right -= 1;
    if (right >= minX) points.push({ x: right, y });
  }
  return points;
}

export function simplifyPoints(points: Point[], maxPoints = 180): Point[] {
  if (points.length <= maxPoints) return points;
  const step = points.length / maxPoints;
  const out: Point[] = [];
  for (let i = 0; i < maxPoints; i += 1) {
    const point = points[Math.floor(i * step)];
    if (point) out.push(point);
  }
  return out;
}

export function assessMaskQuality(
  analysis: PersonMaskAnalysis,
  imageWidth: number,
  imageHeight: number,
  method: ReconstructionQuality['method'],
  usedFallback = false,
): ReconstructionQuality {
  return assessQuality({
    imageWidth,
    imageHeight,
    bounds: analysis.bounds,
    personArea: analysis.personArea,
    secondBlobArea: analysis.secondBlobArea,
    usedFallback,
    method,
  });
}

export function throwIfUnusable(quality: ReconstructionQuality): void {
  if (quality.status === 'failed') {
    throw new Error(quality.messages[0] ?? 'Could not reconstruct a body from this photo.');
  }
}

export type CapturedOutline = {
  imageWidth: number;
  imageHeight: number;
  bounds: Bounds;
  /** Normalized figure-space contour (0–1, y down, padded). */
  outline: Point[];
  mask: Uint8Array;
  quality: ReconstructionQuality;
  outlineImageUrl: string;
  renderWidth: number;
  renderHeight: number;
};

/** Build the stored silhouette from a measured mask. Throws when quality failed. */
export function silhouetteFromCapture(capture: CapturedOutline): SilhouetteResult {
  throwIfUnusable(capture.quality);
  if (capture.outline.length < 3) {
    throw new Error(
      "We couldn't find a person in this photo. Use a full-body, front-facing photo with one person on a plain background.",
    );
  }
  const { proportions, landmarks } = measureBody(
    capture.mask,
    capture.imageWidth,
    capture.imageHeight,
    capture.bounds,
  );
  const body: BodyReconstruction = {
    id: crypto.randomUUID(),
    imageWidth: capture.imageWidth,
    imageHeight: capture.imageHeight,
    silhouette: {
      format: 'png',
      data: capture.outlineImageUrl,
      width: capture.renderWidth,
      height: capture.renderHeight,
    },
    normalizedBounds: {
      x: capture.bounds.x / capture.imageWidth,
      y: capture.bounds.y / capture.imageHeight,
      width: capture.bounds.width / capture.imageWidth,
      height: capture.bounds.height / capture.imageHeight,
    },
    outline: capture.outline,
    landmarks,
    proportions,
    quality: capture.quality,
    createdAt: new Date().toISOString(),
  };
  return toSilhouetteResult(body);
}

export function qualityForMissingPerson(
  imageWidth: number,
  imageHeight: number,
): ReconstructionQuality {
  const input: QualityAssessmentInput = {
    imageWidth,
    imageHeight,
    bounds: null,
    personArea: 0,
    secondBlobArea: 0,
    usedFallback: true,
    method: 'rejected',
  };
  return assessQuality(input);
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}
