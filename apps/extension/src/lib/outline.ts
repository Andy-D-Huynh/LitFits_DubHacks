import type { Point, SilhouetteResult } from './types';

const TARGET_HEIGHT = 480;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

function simplify(points: Point[], maxPoints = 160): Point[] {
  if (points.length <= maxPoints) return points;
  const step = points.length / maxPoints;
  const out: Point[] = [];
  for (let i = 0; i < maxPoints; i += 1) out.push(points[Math.floor(i * step)]!);
  return out;
}

/** Lightweight silhouette for extension side panel (no OpenCV CDN required). */
export async function extractOutline(imageSrc: string): Promise<SilhouetteResult> {
  const img = await loadImage(imageSrc);
  const scale = TARGET_HEIGHT / img.height;
  const width = Math.max(1, Math.round(img.width * scale));
  const height = TARGET_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    gray[i] = 0.299 * data[o]! + 0.587 * data[o + 1]! + 0.114 * data[o + 2]!;
  }

  const corner =
    (gray[0]! + gray[width - 1]! + gray[(height - 1) * width]! + gray[height * width - 1]!) / 4;
  const person = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i += 1) {
    person[i] = Math.abs(gray[i]! - corner) > 28 ? 1 : 0;
  }

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!person[y * width + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  let bounds = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const points: Point[] = [];

  if (maxX <= minX || maxY <= minY) {
    bounds = { x: width * 0.25, y: height * 0.05, width: width * 0.5, height: height * 0.9 };
    for (let a = 0; a < 64; a += 1) {
      const t = (a / 64) * Math.PI * 2;
      points.push({
        x: bounds.x + bounds.width / 2 + Math.cos(t) * (bounds.width / 2),
        y: bounds.y + bounds.height / 2 + Math.sin(t) * (bounds.height / 2),
      });
    }
  } else {
    for (let y = minY; y <= maxY; y += 2) {
      let left = minX;
      while (left <= maxX && !person[y * width + left]) left += 1;
      if (left <= maxX) points.push({ x: left, y });
    }
    for (let y = maxY; y >= minY; y -= 2) {
      let right = maxX;
      while (right >= minX && !person[y * width + right]) right -= 1;
      if (right >= minX) points.push({ x: right, y });
    }
  }

  const pad = 0.04;
  const outline = simplify(
    points.map((p) => ({
      x: ((p.x - bounds.x) / bounds.width) * (1 - pad * 2) + pad,
      y: ((p.y - bounds.y) / bounds.height) * (1 - pad * 2) + pad,
    })),
  );

  if (outline.length < 3) {
    throw new Error('Could not find a person in that photo');
  }

  const outW = 280;
  const outH = 480;
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const octx = out.getContext('2d')!;
  octx.fillStyle = 'rgba(245, 240, 232, 0.95)';
  octx.strokeStyle = '#1a1a1a';
  octx.lineWidth = 3;
  octx.beginPath();
  octx.moveTo(outline[0]!.x * outW, outline[0]!.y * outH);
  for (let i = 1; i < outline.length; i += 1) {
    octx.lineTo(outline[i]!.x * outW, outline[i]!.y * outH);
  }
  octx.closePath();
  octx.fill();
  octx.stroke();

  return {
    outline,
    outlineImageUrl: out.toDataURL('image/png'),
    bounds,
    width: outW,
    height: outH,
    createdAt: new Date().toISOString(),
  };
}
