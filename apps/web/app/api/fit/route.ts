import { FitRequestSchema, computeFit } from '@fitmirror/shared';
import { NextResponse, type NextRequest } from 'next/server';
import { apiContext, loadProfile } from '@/lib/data/context';
import { getGarment } from '@/lib/data/garments';
import { jsonError, parseBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

// Pure computation over stored data: no LLM, no try-on.
export async function POST(req: NextRequest) {
  const body = await parseBody(req, FitRequestSchema);
  if ('response' in body) return body.response;

  const ctx = await apiContext(req);
  if (!ctx) return jsonError(401, 'Not signed in');

  const [profile, garment] = await Promise.all([
    loadProfile(ctx, body.data.profileId),
    getGarment(ctx.garments, body.data.garmentId),
  ]);
  if (!profile) return jsonError(404, 'Profile not found');
  if (!garment) return jsonError(404, 'Garment not found');
  return NextResponse.json(computeFit(garment, profile));
}
