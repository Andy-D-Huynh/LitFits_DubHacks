import { TryOnRequestSchema, addItem, type OutfitEntry } from '@fitmirror/shared';
import { NextResponse, after, type NextRequest } from 'next/server';
import { apiContext, loadProfile } from '@/lib/data/context';
import { getGarments } from '@/lib/data/garments';
import { env } from '@/lib/env';
import { jsonError, parseBody } from '@/lib/http';
import { getTryOnProvider } from '@/lib/providers/tryon';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import {
  garmentImageUrl,
  planRender,
  processRender,
  requestRender,
  type PipelineDeps,
} from '@/lib/tryon/pipeline';
import {
  signedModelPhotoUrl,
  supabaseImageStore,
  supabaseRenderStore,
} from '@/lib/tryon/supabase-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 180; // a real provider takes 10–40 s per layer

// Mock renders don't look at the person image.
const MOCK_PERSON_URL = '/tryon-placeholder.svg';

// Queues a layered render of the given garments on the caller's model photo.
// A cached outfit returns `done` at once; otherwise `queued` (202) and the
// client polls GET /api/tryon/:id. The render never reflects size.
export async function POST(req: NextRequest) {
  const body = await parseBody(req, TryOnRequestSchema);
  if ('response' in body) return body.response;
  const ctx = await apiContext(req);
  if (!ctx) return jsonError(401, 'Not signed in');

  const profile = await loadProfile(ctx, body.data.profileId);
  if (!profile) return jsonError(404, 'Profile not found');
  const ids = [...new Set(body.data.garmentIds)];
  const garments = await getGarments(ctx.garments, ids);
  if (garments.length !== ids.length) return jsonError(404, 'Garment not found');

  // Same slot rules as outfits: one garment per slot, a dress excludes top/bottom.
  let entries: OutfitEntry[] = [];
  for (const g of garments) {
    const change = addItem(entries, { garmentId: g.id, category: g.category, size: null });
    if (change.removed.length > 0) return jsonError(400, 'Garments overlap: one per slot');
    entries = change.items;
  }

  const provider = getTryOnProvider(ctx.demo);
  const personKey = profile.modelPhotoPath ?? `profile:${profile.id}`;

  if (ctx.demo) {
    // No network or DB: render the outfit with the mock and return it directly.
    const plan = planRender(profile.id, personKey, MOCK_PERSON_URL, garments, provider.name);
    const last = plan.layers[plan.layers.length - 1]!;
    const { imageUrl } = await provider.render({ ...last, personImageUrl: MOCK_PERSON_URL });
    return NextResponse.json({
      renderId: null,
      status: 'done',
      chainKey: plan.keys[plan.keys.length - 1],
      imageUrl,
    });
  }

  if (!env().SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError(503, 'Try-on needs SUPABASE_SERVICE_ROLE_KEY on the server');
  }
  const admin = createSupabaseAdminClient();

  let personImageUrl = MOCK_PERSON_URL;
  if (provider.name !== 'mock') {
    if (!profile.modelPhotoPath) return jsonError(409, 'No model photo yet; capture one first');
    if (garments.some((g) => !garmentImageUrl(g))) {
      return jsonError(422, 'Every garment needs a product image for try-on');
    }
    personImageUrl = await signedModelPhotoUrl(admin, profile.modelPhotoPath);
  }

  const deps: PipelineDeps = {
    store: supabaseRenderStore(admin),
    images: supabaseImageStore(admin),
    provider,
  };
  const plan = planRender(profile.id, personKey, personImageUrl, garments, provider.name);
  const { row, needsProcessing } = await requestRender(deps, plan);
  if (needsProcessing) after(() => processRender(deps, plan, row.id));

  const imageUrl =
    row.status === 'done' && row.imagePath ? await deps.images.urlFor(row.imagePath) : null;
  return NextResponse.json(
    { renderId: row.id, status: row.status, chainKey: row.cacheKey, imageUrl },
    { status: row.status === 'done' ? 200 : 202 },
  );
}
