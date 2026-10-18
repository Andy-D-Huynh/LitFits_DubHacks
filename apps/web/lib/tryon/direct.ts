import { createHash } from 'node:crypto';

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
