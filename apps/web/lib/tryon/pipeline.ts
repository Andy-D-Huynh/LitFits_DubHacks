import { createHash } from 'node:crypto';
import { LAYER_POSITION, type Category, type Garment } from '@fitmirror/shared';
import type { TryOnCategory, TryOnProvider } from '../providers/tryon/types';

// Try-on render pipeline (docs/tryon.md). Storage and the provider are injected
// so the caching and queue logic is unit-testable without Supabase.

export type RenderStatus = 'queued' | 'running' | 'done' | 'failed';

export type RenderRow = {
  id: string;
  cacheKey: string;
  profileId: string;
  garmentIds: string[];
  status: RenderStatus;
  provider: string;
  imagePath: string | null;
  error: string | null;
  createdAt: string;
};

export interface RenderStore {
  findByKey(cacheKey: string): Promise<RenderRow | null>;
  findById(id: string): Promise<RenderRow | null>;
  insert(row: Omit<RenderRow, 'id' | 'createdAt'>): Promise<RenderRow>;
  update(id: string, patch: Partial<Omit<RenderRow, 'id'>>): Promise<void>;
}

export interface ImageStore {
  // Persists a provider output; returns the image_path to store.
  save(profileId: string, cacheKey: string, sourceUrl: string): Promise<string>;
  // Resolves an image_path to a URL the client or the next layer can fetch.
  urlFor(imagePath: string): Promise<string>;
}

export type PipelineDeps = {
  store: RenderStore;
  images: ImageStore;
  provider: TryOnProvider;
  now?: () => Date;
};

export type Layer = {
  garmentId: string;
  garmentImageUrl: string;
  category: TryOnCategory;
  description: string;
};

export type RenderPlan = {
  profileId: string;
  personKey: string; // first-layer chain seed: model photo path, or the profile id
  personImageUrl: string;
  layers: Layer[];
  keys: string[]; // keys[i] covers layers[0..i]
};

// Renders stuck in queued/running this long are requeued on the next request.
export const STALE_RENDER_MS = 2 * 60 * 1000;

const TRYON_CATEGORY: Record<Category, TryOnCategory> = {
  top: 'upper_body',
  outerwear: 'upper_body',
  bottom: 'lower_body',
  dress: 'dresses',
};

export function garmentImageUrl(g: Garment): string | null {
  return g.primaryImageUrl ?? g.imageUrls[0] ?? null;
}

// Layer order: dress or top, then bottom, then outerwear. Garments without an
// image get a stable stand-in key (only the mock provider accepts them).
export function toLayers(garments: Garment[]): Layer[] {
  return [...garments]
    .sort((a, b) => LAYER_POSITION[a.category] - LAYER_POSITION[b.category])
    .map((g) => ({
      garmentId: g.id,
      garmentImageUrl: garmentImageUrl(g) ?? `garment:${g.id}`,
      category: TRYON_CATEGORY[g.category],
      description: [g.brand, g.name].filter(Boolean).join(' ') || g.category,
    }));
}

export function layerKey(
  previousKey: string,
  imageUrl: string,
  category: TryOnCategory,
  provider: string,
): string {
  return createHash('sha256')
    .update(JSON.stringify([previousKey, imageUrl, category, provider]))
    .digest('hex');
}

// Each layer's key chains from the previous one, so editing a layer changes
// only its key and the keys above it; removing the top layer is a cache hit.
export function chainKeys(personKey: string, layers: Layer[], provider: string): string[] {
  const keys: string[] = [];
  let prev = personKey;
  for (const l of layers) {
    prev = layerKey(prev, l.garmentImageUrl, l.category, provider);
    keys.push(prev);
  }
  return keys;
}

export function planRender(
  profileId: string,
  personKey: string,
  personImageUrl: string,
  garments: Garment[],
  provider: string,
): RenderPlan {
  const layers = toLayers(garments);
  return {
    profileId,
    personKey,
    personImageUrl,
    layers,
    keys: chainKeys(personKey, layers, provider),
  };
}

function isStale(row: RenderRow, now: Date): boolean {
  return (
    (row.status === 'queued' || row.status === 'running') &&
    now.getTime() - new Date(row.createdAt).getTime() > STALE_RENDER_MS
  );
}

export type RenderRequest = { row: RenderRow; needsProcessing: boolean };

// Returns the render for the whole outfit (the last layer's key). A done or
// in-flight row is reused; failed or stale rows are requeued.
export async function requestRender(deps: PipelineDeps, plan: RenderPlan): Promise<RenderRequest> {
  const now = deps.now?.() ?? new Date();
  const key = plan.keys[plan.keys.length - 1];
  if (!key) throw new Error('A render needs at least one garment');
  const existing = await deps.store.findByKey(key);
  if (existing) {
    const inFlight = existing.status === 'queued' || existing.status === 'running';
    if (existing.status === 'done' || (inFlight && !isStale(existing, now))) {
      return { row: existing, needsProcessing: false };
    }
    const patch = { status: 'queued' as const, error: null, createdAt: now.toISOString() };
    await deps.store.update(existing.id, patch);
    return { row: { ...existing, ...patch }, needsProcessing: true };
  }
  const row = await deps.store.insert({
    cacheKey: key,
    profileId: plan.profileId,
    garmentIds: plan.layers.map((l) => l.garmentId),
    status: 'queued',
    provider: deps.provider.name,
    imagePath: null,
    error: null,
  });
  return { row, needsProcessing: true };
}

// Renders layer by layer, reusing any cached layer (each layer is its own row),
// feeding each output in as the person image for the next layer.
export async function processRender(deps: PipelineDeps, plan: RenderPlan, rowId: string) {
  await deps.store.update(rowId, { status: 'running' });
  const finalIndex = plan.layers.length - 1;
  try {
    let personUrl = plan.personImageUrl;
    for (let i = 0; i <= finalIndex; i++) {
      const layer = plan.layers[i]!;
      const key = plan.keys[i]!;
      const cached = await deps.store.findByKey(key);
      if (cached?.status === 'done' && cached.imagePath) {
        personUrl = await deps.images.urlFor(cached.imagePath);
        continue;
      }
      const out = await deps.provider.render({
        personImageUrl: personUrl,
        garmentImageUrl: layer.garmentImageUrl,
        category: layer.category,
        description: layer.description,
      });
      const imagePath = await deps.images.save(plan.profileId, key, out.imageUrl);
      if (i === finalIndex) {
        await deps.store.update(rowId, { status: 'done', imagePath, error: null });
      } else if (cached) {
        await deps.store.update(cached.id, { status: 'done', imagePath, error: null });
      } else {
        await deps.store.insert({
          cacheKey: key,
          profileId: plan.profileId,
          garmentIds: plan.layers.slice(0, i + 1).map((l) => l.garmentId),
          status: 'done',
          provider: deps.provider.name,
          imagePath,
          error: null,
        });
      }
      personUrl = await deps.images.urlFor(imagePath);
    }
  } catch (e) {
    await deps.store.update(rowId, {
      status: 'failed',
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
