import { renderSizeForBounds } from '@/lib/figure/contracts';
import {
  analyzePersonMask,
  assessMaskQuality,
  orientForeground,
  qualityForMissingPerson,
  silhouetteFromCapture,
  simplifyPoints,
  throwIfUnusable,
  traceOutline,
} from '@/lib/figure/reconstruct';
import { normalizeOutline } from '@/lib/figure/proportions';
import type { Point, ReconstructionQuality, SilhouetteResult } from './types';
import { loadOpenCv } from './load-opencv';

const TARGET_HEIGHT = 480;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

function resizeToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const scale = TARGET_HEIGHT / img.height;
  const width = Math.max(1, Math.round(img.width * scale));
  const height = TARGET_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

function renderOutlineImage(outline: Point[], width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx || outline.length < 3) return canvas.toDataURL('image/png');

  ctx.clearRect(0, 0, width, height);
  ctx.beginPath();
  ctx.moveTo(outline[0]!.x * width, outline[0]!.y * height);
  for (let i = 1; i < outline.length; i += 1) {
    const point = outline[i]!;
    ctx.lineTo(point.x * width, point.y * height);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(245, 240, 232, 0.92)';
  ctx.fill();
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = Math.max(2, width * 0.008);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

/** Canvas path when OpenCV is unavailable. Returns a foreground mask, never a stand-in oval. */
function extractMaskWithCanvas(imageData: ImageData): Uint8Array | null {
  const { width, height, data } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    gray[i] = 0.299 * data[o]! + 0.587 * data[o + 1]! + 0.114 * data[o + 2]!;
  }

  const mag = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx =
        -gray[i - width - 1]! -
        2 * gray[i - 1]! -
        gray[i + width - 1]! +
        gray[i - width + 1]! +
        2 * gray[i + 1]! +
        gray[i + width + 1]!;
      const gy =
        -gray[i - width - 1]! -
        2 * gray[i - width]! -
        gray[i - width + 1]! +
        gray[i + width - 1]! +
        2 * gray[i + width]! +
        gray[i + width + 1]!;
      mag[i] = Math.hypot(gx, gy);
    }
  }

  let sum = 0;
  for (let i = 0; i < mag.length; i += 1) sum += mag[i]!;
  const thresh = (sum / mag.length) * 1.6;
  const edges = new Uint8Array(width * height);
  for (let i = 0; i < mag.length; i += 1) {
    edges[i] = mag[i]! > thresh ? 1 : 0;
  }

  const dilated = new Uint8Array(edges);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (edges[(y + dy) * width + (x + dx)]) {
            on = 1;
            break;
          }
        }
      }
      dilated[y * width + x] = on;
    }
  }
  const closed = new Uint8Array(dilated);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let on = 1;
      for (let dy = -1; dy <= 1 && on; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dilated[(y + dy) * width + (x + dx)]) {
            on = 0;
            break;
          }
        }
      }
      closed[y * width + x] = on;
    }
  }

  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const person = new Uint8Array(width * height);
  const stack = [cy * width + cx];
  person[cy * width + cx] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i - x) / width;
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (person[ni] || closed[ni]) continue;
      person[ni] = 1;
      stack.push(ni);
    }
  }

  let personCount = 0;
  for (let i = 0; i < person.length; i += 1) personCount += person[i]!;
  if (personCount < width * height * 0.02) {
    const corner =
      (gray[0]! + gray[width - 1]! + gray[(height - 1) * width]! + gray[height * width - 1]!) / 4;
    person.fill(0);
    for (let i = 0; i < gray.length; i += 1) {
      person[i] = Math.abs(gray[i]! - corner) > 28 ? 1 : 0;
    }
  }

  let any = 0;
  for (let i = 0; i < person.length; i += 1) any += person[i]!;
  return any > 0 ? person : null;
}

function matToMask(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mat: any,
  width: number,
  height: number,
): Uint8Array {
  const out = new Uint8Array(width * height);
  const data = mat.data as Uint8Array | undefined;
  const step = Array.isArray(mat.step) ? Number(mat.step[0]) : Number(mat.step);
  if (data && step === width && data.length >= out.length) {
    for (let i = 0; i < out.length; i += 1) out[i] = data[i] ? 1 : 0;
    return out;
  }
  if (typeof mat.ucharAt === 'function') {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (mat.ucharAt(y, x)) out[y * width + x] = 1;
      }
    }
    return out;
  }
  if (data) {
    const stride = Number.isFinite(step) && step > 0 ? step : width;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[y * stride + x]) out[y * width + x] = 1;
      }
    }
  }
  return out;
}

function largestContourArea(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cv: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contours: any,
): number {
  let best = 0;
  for (let i = 0; i < contours.size(); i += 1) {
    const area = cv.contourArea(contours.get(i)) as number;
    if (area > best) best = area;
  }
  return best;
}

async function extractMaskWithOpenCv(imageData: ImageData): Promise<Uint8Array | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cv = (await loadOpenCv()) as any;
  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const binary = new cv.Mat();
  const closed = new cv.Mat();
  const hierarchy = new cv.Mat();
  const toDelete: { delete: () => void }[] = [src, gray, blur, binary, closed, hierarchy];

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(7, 7), 0);
    cv.threshold(blur, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(9, 9));
    toDelete.push(kernel);
    cv.morphologyEx(binary, closed, cv.MORPH_CLOSE, kernel);

    const minArea = imageData.width * imageData.height * 0.02;
    const otsuMask = matToMask(closed, imageData.width, imageData.height);
    const contours = new cv.MatVector();
    toDelete.push(contours);
    cv.findContours(closed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    if (largestContourArea(cv, contours) >= minArea) return otsuMask;

    const edges = new cv.Mat();
    const edgeKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
    toDelete.push(edges, edgeKernel);
    cv.Canny(blur, edges, 50, 140);
    cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, edgeKernel);

    const edgeContours = new cv.MatVector();
    toDelete.push(edgeContours);
    cv.findContours(closed, edgeContours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    if (largestContourArea(cv, edgeContours) < minArea) return null;

    const filled = cv.Mat.zeros(imageData.height, imageData.width, cv.CV_8UC1);
    toDelete.push(filled);
    const color = new cv.Scalar(255);
    for (let i = 0; i < edgeContours.size(); i += 1) {
      if ((cv.contourArea(edgeContours.get(i)) as number) < 200) continue;
      cv.drawContours(filled, edgeContours, i, color, -1);
    }
    return matToMask(filled, imageData.width, imageData.height);
  } finally {
    for (const mat of toDelete) mat.delete();
  }
}

/**
 * Trace a flat outline from a photo that stays on this device.
 * OpenCV is preferred; the canvas path runs only if OpenCV fails.
 * A missing person is an error — we do not substitute a synthetic body.
 */
export async function extractSilhouette(imageSrc: string): Promise<SilhouetteResult> {
  const img = await loadImageElement(imageSrc);
  const canvas = resizeToCanvas(img);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const imageWidth = canvas.width;
  const imageHeight = canvas.height;

  let rawMask: Uint8Array | null = null;
  let method: ReconstructionQuality['method'] = 'opencv';
  try {
    rawMask = await extractMaskWithOpenCv(imageData);
  } catch {
    rawMask = null;
  }
  if (!rawMask) {
    method = 'canvas';
    rawMask = extractMaskWithCanvas(imageData);
  }
  if (!rawMask) {
    throwIfUnusable(qualityForMissingPerson(imageWidth, imageHeight));
    throw new Error('Could not reconstruct a body from this photo.');
  }

  const oriented = orientForeground(rawMask, imageWidth, imageHeight);
  const analysis = analyzePersonMask(oriented, imageWidth, imageHeight);
  const quality = assessMaskQuality(analysis, imageWidth, imageHeight, method);
  throwIfUnusable(quality);
  if (!analysis.bounds) {
    throwIfUnusable(qualityForMissingPerson(imageWidth, imageHeight));
    throw new Error('Could not reconstruct a body from this photo.');
  }

  const pixelOutline = traceOutline(analysis.mask, imageWidth, imageHeight, analysis.bounds);
  const outline = simplifyPoints(normalizeOutline(pixelOutline, analysis.bounds));
  const size = renderSizeForBounds(analysis.bounds);
  const outlineImageUrl = renderOutlineImage(outline, size.width, size.height);

  return silhouetteFromCapture({
    imageWidth,
    imageHeight,
    bounds: analysis.bounds,
    outline,
    mask: analysis.mask,
    quality,
    outlineImageUrl,
    renderWidth: size.width,
    renderHeight: size.height,
  });
}
