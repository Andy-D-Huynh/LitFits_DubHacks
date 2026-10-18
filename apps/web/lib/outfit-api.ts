import 'server-only';
import {
  computeFit,
  outfitSummary,
  type FitResult,
  type Garment,
  type OutfitEntry,
  type OutfitWithItems,
  type Profile,
  type Slot,
} from '@fitmirror/shared';
import { NextResponse, type NextRequest } from 'next/server';
import { apiContext, loadProfile, type ApiContext } from './data/context';
import { getGarments } from './data/garments';
import { getOutfit } from './data/outfits';
import { jsonError, UuidParam } from './http';

// Shared plumbing for the /api/outfits routes.

export type LiveContext = Extract<ApiContext, { demo: false }>;

// Demo mode keeps outfits in the client store (shared outfit-rules + computeFit
// are pure), so the outfit routes are for signed-in callers only.
export async function liveContext(req: NextRequest): Promise<LiveContext | NextResponse> {
  const ctx = await apiContext(req);
  if (!ctx) return jsonError(401, 'Not signed in');
  if (ctx.demo) return jsonError(409, 'In demo mode outfits live in the client store');
  return ctx;
}

export type LoadedOutfit = { outfit: OutfitWithItems; profile: Profile };

export async function loadOutfit(
  ctx: LiveContext,
  rawId: string,
): Promise<LoadedOutfit | NextResponse> {
  const id = UuidParam.safeParse(rawId);
  if (!id.success) return jsonError(400, 'Invalid outfit id');
  const outfit = await getOutfit(ctx.auth.supabase, id.data);
  if (!outfit) return jsonError(404, 'Outfit not found');
  const profile = await loadProfile(ctx, outfit.profileId);
  if (!profile) return jsonError(404, 'Outfit not found');
  return { outfit, profile };
}

// A requested size must be a label in the garment's chart (when it has one);
// an omitted size defaults to the fit engine's recommendation.
export function resolveSize(
  garment: Garment,
  profile: Profile,
  requested: string | undefined,
): { size: string | null } | NextResponse {
  const labels = garment.sizeChart?.rows.map((r) => r.label) ?? [];
  if (requested !== undefined) {
    if (labels.length > 0 && !labels.includes(requested)) {
      return jsonError(400, `Size "${requested}" is not in this garment's chart`, {
        sizes: labels,
      });
    }
    return { size: requested };
  }
  return { size: computeFit(garment, profile).recommendedSize };
}

export async function outfitResponse(
  ctx: LiveContext,
  outfit: OutfitWithItems,
  profile: Profile,
  extra: { removed?: OutfitEntry[]; status?: number } = {},
) {
  const garments = await getGarments(
    ctx.garments,
    outfit.items.map((i) => i.garmentId),
  );
  const fits: Partial<Record<Slot, FitResult>> = {};
  for (const item of outfit.items) {
    const garment = garments.find((g) => g.id === item.garmentId);
    if (garment) fits[item.slot] = computeFit(garment, profile);
  }
  const entries = outfit.items.map((i) => ({
    slot: i.slot,
    garmentId: i.garmentId,
    size: i.selectedSize,
    position: i.position ?? 0,
  }));
  return NextResponse.json(
    {
      outfit,
      fits,
      summary: outfitSummary(entries, fits),
      ...(extra.removed ? { removed: extra.removed } : {}),
    },
    { status: extra.status ?? 200 },
  );
}
