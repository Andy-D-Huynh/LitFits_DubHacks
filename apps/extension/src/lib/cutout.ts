export type Raster = {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
};

function dist(a: number, b: number, c: number, d: number, e: number, f: number): number {
  return Math.hypot(a - d, b - e, c - f);
}

/**
 * Remove a near-uniform studio background (typical of flat product photos).
 * Lifestyle and model photos are left unchanged — this is not SAM or inpainting.
 */
export function knockOutStudioBackground(raster: Raster): { raster: Raster; removed: boolean } {
  const { width, height, rgba } = raster;
  const pixelCount = width * height;
  if (width < 2 || height < 2 || rgba.length < pixelCount * 4) {
    return { raster, removed: false };
  }

  const cornerIndex = [0, width - 1, (height - 1) * width, pixelCount - 1];
  const corners = cornerIndex.map((i) => [rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!] as const);
  const bg = corners[0]!;
  for (const corner of corners) {
    if (dist(bg[0], bg[1], bg[2], corner[0], corner[1], corner[2]) > 36) {
      return { raster, removed: false };
    }
  }

  const out = new Uint8ClampedArray(rgba);
  let removedCount = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const o = i * 4;
    if (dist(bg[0], bg[1], bg[2], out[o]!, out[o + 1]!, out[o + 2]!) < 42) {
      out[o + 3] = 0;
      removedCount += 1;
    }
  }

  const fraction = removedCount / pixelCount;
  if (fraction < 0.08 || fraction > 0.92) {
    return { raster, removed: false };
  }

  return {
    raster: { width, height, rgba: out },
    removed: true,
  };
}
