import { NextResponse, type NextRequest } from 'next/server';
import { apiContext } from '@/lib/data/context';
import { env } from '@/lib/env';
import { UuidParam, jsonError } from '@/lib/http';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { supabaseImageStore, supabaseRenderStore } from '@/lib/tryon/supabase-store';

export const dynamic = 'force-dynamic';

// Render status for polling. The row is read as the caller (RLS: own renders
// only); the image URL is signed with the service role, since storage has no
// user policies.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = UuidParam.safeParse((await params).id);
  if (!id.success) return jsonError(400, 'Invalid render id');
  const ctx = await apiContext(req);
  if (!ctx) return jsonError(401, 'Not signed in');
  if (ctx.demo) return jsonError(404, 'Demo renders are returned directly by POST /api/tryon');

  const row = await supabaseRenderStore(ctx.auth.supabase).findById(id.data);
  if (!row) return jsonError(404, 'Render not found');

  let imageUrl: string | null = null;
  if (row.status === 'done' && row.imagePath) {
    if (!env().SUPABASE_SERVICE_ROLE_KEY) {
      return jsonError(503, 'Try-on needs SUPABASE_SERVICE_ROLE_KEY on the server');
    }
    imageUrl = await supabaseImageStore(createSupabaseAdminClient()).urlFor(row.imagePath);
  }
  return NextResponse.json({
    renderId: row.id,
    status: row.status,
    chainKey: row.cacheKey,
    imageUrl,
    error: row.error,
  });
}
