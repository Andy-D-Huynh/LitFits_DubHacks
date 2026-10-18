import { OutfitItemInputSchema, SlotSchema, removeItem, swapItem } from '@fitmirror/shared';
import { NextResponse, type NextRequest } from 'next/server';
import { getGarment } from '@/lib/data/garments';
import { getOutfit, saveItems } from '@/lib/data/outfits';
import { toEntries } from '@/lib/db/outfits';
import { jsonError, parseBody } from '@/lib/http';
import { liveContext, loadOutfit, outfitResponse, resolveSize } from '@/lib/outfit-api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; slot: string }> };

// Swap the garment in a slot, or change its size, keeping its layer position.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, slot: rawSlot } = await params;
  const slot = SlotSchema.safeParse(rawSlot);
  if (!slot.success) return jsonError(400, 'Invalid slot');
  const body = await parseBody(req, OutfitItemInputSchema);
  if ('response' in body) return body.response;
  const ctx = await liveContext(req);
  if (ctx instanceof NextResponse) return ctx;
  const loaded = await loadOutfit(ctx, id);
  if (loaded instanceof NextResponse) return loaded;
  const { outfit, profile } = loaded;

  const garment = await getGarment(ctx.garments, body.data.garmentId);
  if (!garment) return jsonError(404, 'Garment not found');
  const size = resolveSize(garment, profile, body.data.size);
  if (size instanceof NextResponse) return size;

  const before = toEntries(outfit.items);
  const change = swapItem(before, slot.data, {
    garmentId: garment.id,
    category: garment.category,
    size: size.size,
  });
  if ('error' in change) {
    return change.error === 'slot_empty'
      ? jsonError(404, `Nothing in the ${slot.data} slot to swap`)
      : jsonError(400, `A ${garment.category} can't go in the ${slot.data} slot`);
  }
  await saveItems(ctx.auth.supabase, outfit.id, before, change.items);
  const updated = (await getOutfit(ctx.auth.supabase, outfit.id)) ?? outfit;
  return outfitResponse(ctx, updated, profile, { removed: change.removed });
}

// Remove empties the slot; removing top or bottom while a dress is worn removes the dress.
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id, slot: rawSlot } = await params;
  const slot = SlotSchema.safeParse(rawSlot);
  if (!slot.success) return jsonError(400, 'Invalid slot');
  const ctx = await liveContext(req);
  if (ctx instanceof NextResponse) return ctx;
  const loaded = await loadOutfit(ctx, id);
  if (loaded instanceof NextResponse) return loaded;
  const { outfit, profile } = loaded;

  const before = toEntries(outfit.items);
  const change = removeItem(before, slot.data);
  if (change.removed.length === 0) return jsonError(404, `Nothing in the ${slot.data} slot`);
  await saveItems(ctx.auth.supabase, outfit.id, before, change.items);
  const updated = (await getOutfit(ctx.auth.supabase, outfit.id)) ?? outfit;
  return outfitResponse(ctx, updated, profile, { removed: change.removed });
}
