import { NextResponse, type NextRequest } from 'next/server';
import { getGarment } from '@/lib/data/garments';
import { isDemo } from '@/lib/demo';
import { UuidParam, jsonError } from '@/lib/http';
import { supabaseForRequest } from '@/lib/supabase/request';

export const dynamic = 'force-dynamic';

// Garments are a shared catalog, readable without signing in.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = UuidParam.safeParse((await params).id);
  if (!id.success) return jsonError(400, 'Invalid garment id');

  const garment = isDemo(req.nextUrl.searchParams)
    ? await getGarment({ demo: true }, id.data)
    : await getGarment(
        { demo: false, supabase: (await supabaseForRequest(req)).supabase },
        id.data,
      );
  return garment ? NextResponse.json(garment) : jsonError(404, 'Garment not found');
}
