import type { NormBox } from '@fitmirror/shared';
import sharp from 'sharp';

// Model photo processing (docs/checkout-privacy.md, docs/tryon.md). No
// 'server-only' import so the try-on smoke script can reuse it from Node.

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_EDGE_PX = 2048;
const MIN_HEIGHT_PX = 512;

export type ProcessedPhoto = { jpeg: Buffer; width: number; height: number };

// Applies the EXIF orientation, then re-encodes. sharp drops all metadata
// (EXIF, GPS, XMP, ICC) unless asked to keep it, so the output carries none.
export async function processModelPhoto(input: Buffer): Promise<ProcessedPhoto> {
  const { data, info } = await sharp(input, { failOn: 'error' })
    .rotate()
    .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  if (info.height < MIN_HEIGHT_PX) {
    throw new PhotoError(`Photo is too small; use one at least ${MIN_HEIGHT_PX}px tall`);
  }
  return { jpeg: data, width: info.width, height: info.height };
}

export class PhotoError extends Error {}

export function boxToPixels(box: NormBox, width: number, height: number) {
  const left = Math.max(0, Math.floor(box.x * width));
  const top = Math.max(0, Math.floor(box.y * height));
  return {
    left,
    top,
    width: Math.max(1, Math.min(width - left, Math.ceil(box.w * width))),
    height: Math.max(1, Math.min(height - top, Math.ceil(box.h * height))),
  };
}

// Pixelates then blurs the head region so the face isn't recoverable; the rest
// of the photo is untouched.
export async function blurRegion(photo: ProcessedPhoto, box: NormBox): Promise<Buffer> {
  const r = boxToPixels(box, photo.width, photo.height);
  // Downscale with averaging (not nearest, which would keep single pixels'
  // detail), scale back up, then blur heavily relative to the head's size.
  const blocks = Math.max(2, Math.round(r.width / 32));
  const tiny = await sharp(photo.jpeg).extract(r).resize({ width: blocks }).toBuffer();
  const patch = await sharp(tiny)
    .resize({ width: r.width, height: r.height, fit: 'fill', kernel: 'nearest' })
    .blur(Math.max(4, r.width / 10))
    .toBuffer();
  return sharp(photo.jpeg)
    .composite([{ input: patch, left: r.left, top: r.top }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
