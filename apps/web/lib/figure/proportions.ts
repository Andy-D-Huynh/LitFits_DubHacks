import type { BodyLandmarks, BodyProportions, Bounds, Point } from '../opencv/types';

/**
 * Visible proportions from a binary person mask.
 * Ratios are fractions of the person-box height (widths too). They are not
 * centimetre measurements, and they do not describe hidden anatomy.
 */

export function normalizeOutline(points: Point[], bounds: Bounds, pad = 0.04): Point[] {
  if (!(bounds.width > 0) || !(bounds.height > 0)) {
    return points.map((point) => ({ x: point.x, y: point.y }));
  }
  const span = 1 - pad * 2;
  return points.map((point) => ({
    x: ((point.x - bounds.x) / bounds.width) * span + pad,
    y: ((point.y - bounds.y) / bounds.height) * span + pad,
  }));
}

type RowSpan = { left: number; right: number; span: number };

export type BodyMeasurement = {
  proportions: BodyProportions;
  landmarks: BodyLandmarks;
};

export function estimateProportions(
  mask: Uint8Array,
  width: number,
  height: number,
  bounds: Bounds,
): BodyProportions {
  return measureBody(mask, width, height, bounds).proportions;
}

export function estimateLandmarks(
  mask: Uint8Array,
  width: number,
  height: number,
  bounds: Bounds,
): BodyLandmarks {
  return measureBody(mask, width, height, bounds).landmarks;
}

export function measureBody(
  mask: Uint8Array,
  width: number,
  height: number,
  bounds: Bounds,
): BodyMeasurement {
  const empty: BodyMeasurement = { proportions: {}, landmarks: {} };
  if (width <= 0 || height <= 0 || !(bounds.width > 0) || !(bounds.height > 0)) return empty;
  if (mask.length < width * height) return empty;

  const rows = measureRows(mask, width, height, bounds);
  const proportions: BodyProportions = {};
  const landmarks: BodyLandmarks = {};

  const headBand = band(bounds, height, 0, 0.12);
  if (headBand) {
    const headSpans = collectSpans(rows, headBand.y0, headBand.y1);
    if (headSpans.length > 0) {
      proportions.headRatio = median(headSpans) / bounds.height;
    }
  }

  const shoulderBand = band(bounds, height, 0.15, 0.35);
  const hipBand = band(bounds, height, 0.48, 0.68);
  const shoulder = shoulderBand ? widestRow(rows, shoulderBand.y0, shoulderBand.y1) : null;
  const hip = hipBand ? widestRow(rows, hipBand.y0, hipBand.y1) : null;

  if (shoulder) {
    proportions.shoulderWidthRatio = shoulder.span / bounds.height;
    landmarks.shoulders = edgePair(shoulder, bounds);
  }
  if (hip) {
    proportions.hipWidthRatio = hip.span / bounds.height;
    landmarks.hips = edgePair(hip, bounds);
  }
  if (shoulder && hip && hip.y >= shoulder.y) {
    proportions.torsoRatio = (hip.y - shoulder.y) / bounds.height;
  }

  const top = firstRow(rows, bounds, height);
  if (top) {
    const [headTop] = normalizeOutline(
      [{ x: (top.left + top.right) / 2, y: top.y }],
      bounds,
    );
    if (headTop) landmarks.headTop = headTop;
  }

  if (hip) {
    const legBottom = Math.min(height - 1, Math.floor(bounds.y + bounds.height) - 1);
    if (legBottom > hip.y) {
      const knee = kneeRow(rows, hip.y, legBottom, hip.span);
      proportions.upperLegRatio = (knee.y - hip.y) / bounds.height;
      proportions.lowerLegRatio = (legBottom - knee.y) / bounds.height;
      if (knee.measured) {
        const row = rows[knee.y];
        if (row) landmarks.knees = edgePair({ ...row, y: knee.y }, bounds);
      }
    }
  }

  const armRatio = estimateArmRatio(rows, bounds, shoulder, hip);
  if (armRatio !== undefined) proportions.armRatio = armRatio;

  return { proportions, landmarks };
}

function measureRows(mask: Uint8Array, width: number, height: number, bounds: Bounds): Array<RowSpan | undefined> {
  const rows: Array<RowSpan | undefined> = new Array(height);
  const y0 = clamp(Math.floor(bounds.y), 0, height - 1);
  const y1 = clamp(Math.floor(bounds.y + bounds.height) - 1, 0, height - 1);
  const x0 = clamp(Math.floor(bounds.x), 0, width - 1);
  const x1 = clamp(Math.floor(bounds.x + bounds.width) - 1, 0, width - 1);
  if (y1 < y0 || x1 < x0) return rows;

  for (let y = y0; y <= y1; y += 1) {
    let left = -1;
    let right = -1;
    const offset = y * width;
    for (let x = x0; x <= x1; x += 1) {
      if (!mask[offset + x]) continue;
      if (left < 0) left = x;
      right = x;
    }
    if (left >= 0 && right >= left) {
      rows[y] = { left, right, span: right - left + 1 };
    }
  }
  return rows;
}

/** Inclusive row band. `end` is exclusive in fraction space (`ceil(end) - 1`). */
function band(
  bounds: Bounds,
  imageHeight: number,
  start: number,
  end: number,
): { y0: number; y1: number } | null {
  const last = Math.min(imageHeight - 1, Math.floor(bounds.y + bounds.height) - 1);
  const first = clamp(Math.floor(bounds.y), 0, last);
  const y0 = clamp(Math.floor(bounds.y + start * bounds.height), first, last);
  const y1 = clamp(Math.ceil(bounds.y + end * bounds.height) - 1, first, last);
  if (y1 < y0) return null;
  return { y0, y1 };
}

function collectSpans(rows: Array<RowSpan | undefined>, y0: number, y1: number): number[] {
  const spans: number[] = [];
  for (let y = y0; y <= y1; y += 1) {
    const span = rows[y]?.span;
    if (span && span > 0) spans.push(span);
  }
  return spans;
}

function widestRow(
  rows: Array<RowSpan | undefined>,
  y0: number,
  y1: number,
): (RowSpan & { y: number }) | null {
  let bestSpan = 0;
  const candidates: number[] = [];
  for (let y = y0; y <= y1; y += 1) {
    const span = rows[y]?.span ?? 0;
    if (span <= 0) continue;
    if (span > bestSpan) {
      bestSpan = span;
      candidates.length = 0;
      candidates.push(y);
    } else if (span === bestSpan) {
      candidates.push(y);
    }
  }
  if (candidates.length === 0) return null;
  const mid = (y0 + y1) / 2;
  let bestY = candidates[0]!;
  let bestDist = Math.abs(bestY - mid);
  for (let i = 1; i < candidates.length; i += 1) {
    const y = candidates[i]!;
    const dist = Math.abs(y - mid);
    if (dist < bestDist) {
      bestDist = dist;
      bestY = y;
    }
  }
  const row = rows[bestY];
  if (!row) return null;
  return { ...row, y: bestY };
}

function firstRow(
  rows: Array<RowSpan | undefined>,
  bounds: Bounds,
  imageHeight: number,
): (RowSpan & { y: number }) | null {
  const y0 = clamp(Math.floor(bounds.y), 0, imageHeight - 1);
  const y1 = clamp(Math.floor(bounds.y + bounds.height) - 1, 0, imageHeight - 1);
  for (let y = y0; y <= y1; y += 1) {
    const row = rows[y];
    if (row) return { ...row, y };
  }
  return null;
}

/**
 * Knee is the row below the hips where the silhouette narrows the most.
 * A rectangle never narrows, so the leg region is split in half — that is a
 * stand-in only when no narrowing was measured, and it does not invent a knee landmark.
 */
function kneeRow(
  rows: Array<RowSpan | undefined>,
  hipY: number,
  legBottom: number,
  hipSpan: number,
): { y: number; measured: boolean } {
  let bestDrop = 0;
  let kneeY = -1;
  for (let y = hipY + 1; y <= legBottom; y += 1) {
    const prev = rows[y - 1]?.span ?? 0;
    const current = rows[y]?.span ?? 0;
    const drop = prev - current;
    if (drop > bestDrop) {
      bestDrop = drop;
      kneeY = y;
    }
  }
  const meaningful = Math.max(2, hipSpan * 0.08);
  if (kneeY >= 0 && bestDrop >= meaningful && rows[kneeY]) {
    return { y: kneeY, measured: true };
  }
  const mid = hipY + Math.max(1, Math.round((legBottom - hipY) / 2));
  return { y: Math.min(mid, legBottom), measured: false };
}

function estimateArmRatio(
  rows: Array<RowSpan | undefined>,
  bounds: Bounds,
  shoulder: (RowSpan & { y: number }) | null,
  hip: (RowSpan & { y: number }) | null,
): number | undefined {
  if (!shoulder || !hip) return undefined;
  const y0 = Math.min(shoulder.y, hip.y);
  const y1 = Math.max(shoulder.y, hip.y);
  const torsoSpans = collectSpans(rows, y0, y1);
  if (torsoSpans.length === 0) return undefined;
  const torsoMedian = median(torsoSpans);
  const margin = Math.max(2, torsoMedian * 0.12);
  let minY = Number.POSITIVE_INFINITY;
  let maxY = -1;
  const searchEnd = Math.min(rows.length - 1, Math.floor(bounds.y + bounds.height) - 1);
  const searchStart = clamp(Math.floor(bounds.y), 0, searchEnd);
  for (let y = searchStart; y <= searchEnd; y += 1) {
    const span = rows[y]?.span ?? 0;
    if (span <= torsoMedian + margin) continue;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxY < minY) return undefined;
  const ratio = (maxY - minY + 1) / bounds.height;
  // A one-row bump is not an arm we can see.
  if (ratio < 0.05) return undefined;
  return ratio;
}

function edgePair(row: RowSpan & { y: number }, bounds: Bounds): [Point, Point] {
  const [left, right] = normalizeOutline(
    [
      { x: row.left, y: row.y },
      { x: row.right, y: row.y },
    ],
    bounds,
  );
  return [left!, right!];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1]! + sorted[mid]!) / 2;
  return sorted[mid]!;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}
