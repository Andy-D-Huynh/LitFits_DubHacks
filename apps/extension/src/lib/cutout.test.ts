import { describe, expect, it } from 'vitest';
import { knockOutStudioBackground } from './cutout';

function fill(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = paint(x, y);
      const o = (y * width + x) * 4;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = a;
    }
  }
  return { width, height, rgba };
}

describe('knockOutStudioBackground', () => {
  it('clears a white studio background and keeps the garment', () => {
    const raster = fill(20, 20, (x, y) => {
      const inside = x > 4 && x < 15 && y > 4 && y < 15;
      return inside ? [20, 40, 80, 255] : [250, 250, 250, 255];
    });
    const result = knockOutStudioBackground(raster);
    expect(result.removed).toBe(true);
    expect(result.raster.rgba[3]).toBe(0);
    const center = (10 * 20 + 10) * 4;
    expect(result.raster.rgba[center + 3]).toBe(255);
  });

  it('leaves a busy photo alone when the corners disagree', () => {
    const raster = fill(10, 10, (x, y) => [x * 20, y * 20, 30, 255]);
    const result = knockOutStudioBackground(raster);
    expect(result.removed).toBe(false);
    expect(result.raster.rgba).toBe(raster.rgba);
  });
});
