import { createHash } from 'node:crypto';
import { FALLBACK_HEAD_BOX, type NormBox } from '@fitmirror/shared';
import { MAX_PHOTO_BYTES, PhotoError, blurRegion, processModelPhoto } from '../photos/process';

// Result cache for POST /api/tryon/direct, the extension prototype's
// session-less try-on. It has no profile, so the render cache and per-profile
// budget in pipeline.ts can't apply. Kept in process memory: best effort only
// (each server instance has its own), which is why the route is off in
// production unless TRYON_DIRECT_ENABLED=true.

const MAX_ENTRIES = 500;

export function directCacheKey(modelImage: string, garmentImage: string, category: string) {
  return createHash('sha256')
    .update(JSON.stringify([modelImage, garmentImage, category]))
    .digest('hex');
}

export function createResultCache(maxEntries = MAX_ENTRIES) {
  const entries = new Map<string, string>();
  return {
    get: (key: string) => entries.get(key),
    set(key: string, imageUrl: string) {
      // Oldest first out; Map keeps insertion order.
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value!);
      entries.set(key, imageUrl);
    },
  };
}

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/;

/**
 * The extension's own photo, made faceless before it goes to fal: the same
 * processing and blur as an /onboarding upload (EXIF stripped, head pixelated
 * and blurred). `box` comes from MediaPipe in the extension; without one the
 * top band of the photo is blurred. Throws PhotoError for unusable input.
 */
export async function facelessDataUrl(modelImage: string, box: NormBox | null): Promise<string> {
  const match = DATA_URL.exec(modelImage);
  if (!match) throw new PhotoError('The photo to blur must be a JPEG, PNG or WebP data URL');
  const bytes = Buffer.from(match[2]!, 'base64');
  if (bytes.byteLength > MAX_PHOTO_BYTES) throw new PhotoError('Photo is larger than 10 MB');
  const photo = await processModelPhoto(bytes);
  const faceless = await blurRegion(photo, box ?? FALLBACK_HEAD_BOX);
  return `data:image/jpeg;base64,${faceless.toString('base64')}`;
}
