import { describe, expect, it } from 'vitest';
import { estimateLandmarks, estimateProportions, normalizeOutline } from './proportions';

describe('normalizeOutline', () => {
  it('keeps a tall box taller once normalized deltas are scaled back by the bounds', () => {
    const bounds = { x: 10, y: 20, width: 100, height: 400 };
    const points = [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    ];
    const [top, bottom] = normalizeOutline(points, bounds);
    const pad = 0.04;
    const scale = 1 - pad * 2;
    const dx = ((bottom!.x - top!.x) / scale) * bounds.width;
    const dy = ((bottom!.y - top!.y) / scale) * bounds.height;

    expect(top).toEqual({ x: pad, y: pad });
    expect(dy).toBeGreaterThan(dx);
    expect(dy / dx).toBeCloseTo(bounds.height / bounds.width, 5);
  });
});

describe('estimateProportions', () => {
  it('reads a standing rectangle as a body whose shoulder width matches the rectangle', () => {
    const imageWidth = 120;
    const imageHeight = 480;
    const bounds = { x: 30, y: 40, width: 40, height: 360 };
    const mask = new Uint8Array(imageWidth * imageHeight);
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        mask[y * imageWidth + x] = 1;
      }
    }

    const proportions = estimateProportions(mask, imageWidth, imageHeight, bounds);
    const widthOverHeight = bounds.width / bounds.height;

    expect(proportions.shoulderWidthRatio).toBeCloseTo(widthOverHeight, 5);
    expect(proportions.hipWidthRatio).toBeCloseTo(widthOverHeight, 5);
    expect(proportions.headRatio).toBeCloseTo(widthOverHeight, 5);
    expect(proportions.armRatio).toBeUndefined();

    const vertical =
      (proportions.torsoRatio ?? 0) +
      (proportions.upperLegRatio ?? 0) +
      (proportions.lowerLegRatio ?? 0);
    expect(proportions.torsoRatio).toBeGreaterThan(0);
    expect(proportions.upperLegRatio).toBeGreaterThan(0);
    expect(proportions.lowerLegRatio).toBeGreaterThan(0);
    // Shoulder line sits below the head band, so these three cover most of the body.
    expect(vertical).toBeGreaterThan(0.6);
    expect(vertical).toBeLessThanOrEqual(1);

    const landmarks = estimateLandmarks(mask, imageWidth, imageHeight, bounds);
    expect(landmarks.shoulders?.[0]?.x).toBeCloseTo(0.04, 2);
    expect(landmarks.shoulders?.[1]?.x).toBeGreaterThan(0.9);
    expect(landmarks.hips?.[0]?.x).toBeLessThan(landmarks.hips?.[1]?.x ?? 0);
    expect(landmarks.knees).toBeUndefined();
  });

  it('treats rows wider than the torso as visible arms', () => {
    const width = 120;
    const height = 200;
    const bounds = { x: 0, y: 0, width, height };
    const mask = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 40; x < 70; x += 1) mask[y * width + x] = 1;
    }
    for (let y = 30; y <= 70; y += 1) {
      for (let x = 10; x < 100; x += 1) mask[y * width + x] = 1;
    }

    const proportions = estimateProportions(mask, width, height, bounds);
    expect(proportions.shoulderWidthRatio).toBeGreaterThan(proportions.hipWidthRatio ?? 1);
    expect(proportions.armRatio).toBeGreaterThan(0.1);
    expect(proportions.armRatio).toBeLessThan(0.4);
  });

  it('returns no ratios for an empty mask or zero bounds', () => {
    expect(
      estimateProportions(new Uint8Array(0), 0, 0, { x: 0, y: 0, width: 0, height: 0 }),
    ).toEqual({});
    expect(
      estimateLandmarks(new Uint8Array(10), 0, 0, { x: 0, y: 0, width: 0, height: 0 }),
    ).toEqual({});
  });
});
