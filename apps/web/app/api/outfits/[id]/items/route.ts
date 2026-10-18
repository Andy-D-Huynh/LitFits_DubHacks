import { OutfitItemInputSchema, addItem } from '@fitmirror/shared';
import { NextResponse, type NextRequest } from 'next/server';
import { getGarment } from '@/lib/data/garments';
import { getOutfit, saveItems } from '@/lib/data/outfits';
import { toEntries } from '@/lib/db/outfits';
import { jsonError, parseBody } from '@/lib/http';
import { liveContext, loadOutfit, outfitResponse, resolveSize } from '@/lib/outfit-api';

export const dynamic = 'force-dynamic';

// Add: places the garment in the slot for its category. An occupied slot (or a
// dress vs top/bottom clash) is a swap; `removed` lists what was replaced so
// the client can offer Undo.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await parseBody(req, OutfitItemInputSchema);
  if ('response' in body) return body.response;
  const ctx = await liveContext(req);
  if (ctx instanceof NextResponse) return ctx;
  const loaded = await loadOutfit(ctx, (await params).id);
  if (loaded instanceof NextResponse) return loaded;
  const { outfit, profile } = loaded;

  const garment = await getGarment(ctx.garments, body.data.garmentId);
  if (!garment) return jsonError(404, 'Garment not found');
  const size = resolveSize(garment, profile, body.data.size);
  if (size instanceof NextResponse) return size;

  const before = toEntries(outfit.items);
  const change = addItem(before, {
    garmentId: garment.id,
    category: garment.category,
    size: size.size,
  });
  await saveItems(ctx.auth.supabase, outfit.id, before, change.items);
  const updated = (await getOutfit(ctx.auth.supabase, outfit.id)) ?? outfit;
  return outfitResponse(ctx, updated, profile, { removed: change.removed });
}
