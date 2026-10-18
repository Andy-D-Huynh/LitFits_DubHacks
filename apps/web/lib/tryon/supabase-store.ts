import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImageStore, RenderRow, RenderStore } from './pipeline';

// Render rows are written with the service role: users have read-only RLS on
// tryon_renders so status and image paths can't be forged.

type Row = {
  id: string;
  cache_key: string;
  profile_id: string;
  garment_ids: string[];
  status: RenderRow['status'];
  provider: string;
  image_path: string | null;
  error: string | null;
  created_at: string;
};

function fromRow(r: Row): RenderRow {
  return {
    id: r.id,
    cacheKey: r.cache_key,
    profileId: r.profile_id,
    garmentIds: r.garment_ids,
    status: r.status,
    provider: r.provider,
    imagePath: r.image_path,
    error: r.error,
    createdAt: r.created_at,
  };
}

function toRow(p: Partial<Omit<RenderRow, 'id'>>): Partial<Row> {
  const out: Partial<Row> = {};
  if (p.cacheKey !== undefined) out.cache_key = p.cacheKey;
  if (p.profileId !== undefined) out.profile_id = p.profileId;
  if (p.garmentIds !== undefined) out.garment_ids = p.garmentIds;
  if (p.status !== undefined) out.status = p.status;
  if (p.provider !== undefined) out.provider = p.provider;
  if (p.imagePath !== undefined) out.image_path = p.imagePath;
  if (p.error !== undefined) out.error = p.error;
  if (p.createdAt !== undefined) out.created_at = p.createdAt;
  return out;
}

// Works with the admin client (writes) or a user client (RLS-scoped reads).
export function supabaseRenderStore(db: SupabaseClient): RenderStore {
  const one = async (column: 'cache_key' | 'id', value: string) => {
    const { data, error } = await db
      .from('tryon_renders')
      .select('*')
      .eq(column, value)
      .maybeSingle<Row>();
    if (error) throw new Error(`Loading render failed: ${error.message}`);
    return data ? fromRow(data) : null;
  };
  return {
    findByKey: (key) => one('cache_key', key),
    findById: (id) => one('id', id),
    async insert(row) {
      const { data, error } = await db
        .from('tryon_renders')
        .insert(toRow(row))
        .select('*')
        .single<Row>();
      if (error) throw new Error(`Saving render failed: ${error.message}`);
      return fromRow(data);
    },
    async countSince(profileId, provider, sinceIso) {
      const { count, error } = await db
        .from('tryon_renders')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .eq('provider', provider)
        .gte('created_at', sinceIso);
      if (error) throw new Error(`Counting renders failed: ${error.message}`);
      return count ?? 0;
    },
    async update(id, patch) {
      const { error } = await db.from('tryon_renders').update(toRow(patch)).eq('id', id);
      if (error) throw new Error(`Updating render failed: ${error.message}`);
    },
  };
}

const RENDERS_BUCKET = 'renders';
const SIGNED_URL_SECONDS = 600; // docs/checkout-privacy.md: signed URLs expire in 10 minutes

function isDirectUrl(path: string): boolean {
  return path.startsWith('/') || /^https?:\/\//.test(path);
}

// Mock outputs are local public paths (e.g. /tryon-placeholder.svg) and are
// stored as-is; real provider outputs are copied into the private bucket.
export function supabaseImageStore(admin: SupabaseClient): ImageStore {
  return {
    async save(profileId, cacheKey, sourceUrl) {
      if (sourceUrl.startsWith('/')) return sourceUrl;
      const res = await fetch(sourceUrl);
      if (!res.ok) throw new Error(`Downloading render failed (${res.status})`);
      const type = res.headers.get('content-type') ?? 'image/jpeg';
      const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
      const path = `${profileId}/${cacheKey}.${ext}`;
      const { error } = await admin.storage
        .from(RENDERS_BUCKET)
        .upload(path, await res.arrayBuffer(), { contentType: type, upsert: true });
      if (error) throw new Error(`Storing render failed: ${error.message}`);
      return path;
    },
    async urlFor(path) {
      if (isDirectUrl(path)) return path;
      const { data, error } = await admin.storage
        .from(RENDERS_BUCKET)
        .createSignedUrl(path, SIGNED_URL_SECONDS);
      if (error) throw new Error(`Signing render URL failed: ${error.message}`);
      return data.signedUrl;
    },
  };
}
