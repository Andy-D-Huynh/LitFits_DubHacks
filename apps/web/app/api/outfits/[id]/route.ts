import { NextResponse, type NextRequest } from 'next/server';
import { deleteOutfit } from '@/lib/data/outfits';
import { liveContext, loadOutfit, outfitResponse } from '@/lib/outfit-api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const ctx = await liveContext(req);
  if (ctx instanceof NextResponse) return ctx;
  const loaded = await loadOutfit(ctx, (await params).id);
  if (loaded instanceof NextResponse) return loaded;
  return outfitResponse(ctx, loaded.outfit, loaded.profile);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const ctx = await liveContext(req);
  if (ctx instanceof NextResponse) return ctx;
  const loaded = await loadOutfit(ctx, (await params).id);
  if (loaded instanceof NextResponse) return loaded;
  await deleteOutfit(ctx.auth.supabase, loaded.outfit.id);
  return new NextResponse(null, { status: 204 });
}
