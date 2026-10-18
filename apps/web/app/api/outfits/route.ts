import { CreateOutfitSchema } from '@fitmirror/shared';
import { NextResponse, type NextRequest } from 'next/server';
import { loadProfile } from '@/lib/data/context';
import { createOutfit, listOutfits } from '@/lib/data/outfits';
import { jsonError, parseBody } from '@/lib/http';
import { liveContext, outfitResponse } from '@/lib/outfit-api';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await liveContext(req);
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json(await listOutfits(ctx.auth.supabase));
}

export async function POST(req: NextRequest) {
  const body = await parseBody(req, CreateOutfitSchema);
  if ('response' in body) return body.response;
  const ctx = await liveContext(req);
  if (ctx instanceof NextResponse) return ctx;

  const profile = await loadProfile(ctx, body.data.profileId);
  if (!profile) return jsonError(404, 'Profile not found');
  const outfit = await createOutfit(ctx.auth.supabase, profile.id, body.data.name ?? null);
  return outfitResponse(ctx, outfit, profile, { status: 201 });
}
