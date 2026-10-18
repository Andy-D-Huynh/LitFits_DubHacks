import { randomUUID } from 'node:crypto';
import { IngestRequestSchema, type Category, type Garment } from '@fitmirror/shared';
import { NextResponse, type NextRequest } from 'next/server';
import { garmentToRow, rowToGarment, type GarmentRow } from '@/lib/db/garments';
import { isDemo } from '@/lib/demo';
import { env } from '@/lib/env';
import { jsonError, parseBody } from '@/lib/http';
import { demoGarmentId, normalizedToGarment } from '@/lib/ingest/build';
import { canonicalProductUrl } from '@/lib/ingest/url';
import { getNormalizer } from '@/lib/providers/llm';
import { clientIp, createRateLimiter } from '@/lib/rate-limit';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const limit = createRateLimiter(20, 60_000); // 20 ingests per minute per IP

// The extension calls this from its chrome-extension:// origin.
function cors(req: NextRequest, res: NextResponse): NextResponse {
  const origin = req.headers.get('origin');
  if (origin?.startsWith('chrome-extension://')) {
    res.headers.set('access-control-allow-origin', origin);
    res.headers.set('access-control-allow-methods', 'POST, OPTIONS');
    res.headers.set('access-control-allow-headers', 'content-type, authorization');
    res.headers.set('vary', 'origin');
  }
  return res;
}

export function OPTIONS(req: NextRequest) {
  return cors(req, new NextResponse(null, { status: 204 }));
}

// Turns an extracted product page into a garment in the shared catalog.
// Idempotent on the canonical source URL: a known page returns 200 with the
// stored garment; a new one is normalized, saved and returned with 201.
export async function POST(req: NextRequest) {
  return cors(req, await ingest(req));
}

async function ingest(req: NextRequest): Promise<NextResponse> {
  const rate = limit(clientIp(req.headers));
  if (!rate.ok) {
    const res = jsonError(429, 'Too many ingests; slow down');
    res.headers.set('retry-after', String(rate.retryAfterS));
    return res;
  }
  const body = await parseBody(req, IngestRequestSchema);
  if ('response' in body) return body.response;
  if (body.data.source === 'screenshot') {
    return jsonError(501, 'Screenshot extraction is not implemented yet; use the manual form');
  }

  const sourceUrl = canonicalProductUrl(body.data.url);
  const demo = isDemo(req.nextUrl.searchParams);

  const normalize = async () => {
    const n = await getNormalizer(demo).normalize({ ...body.data, url: sourceUrl });
    if (n.category === 'unsupported') return null;
    return normalizedToGarment({ ...n, category: n.category as Category }, sourceUrl);
  };
  const unsupported = () =>
    jsonError(422, 'FitMirror supports tops, bottoms, outerwear and dresses only');

  if (demo) {
    // No DB in demo mode: normalize with the mock and return it unsaved.
    const garment = await normalize();
    if (!garment) return unsupported();
    const full: Garment = {
      ...garment,
      id: demoGarmentId(sourceUrl),
      createdAt: new Date().toISOString(),
    };
    return NextResponse.json(full, { status: 201 });
  }

  if (!env().SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError(503, 'Ingest needs SUPABASE_SERVICE_ROLE_KEY on the server');
  }
  const admin = createSupabaseAdminClient();
  const findExisting = async () => {
    const { data, error } = await admin
      .from('garments')
      .select('*')
      .eq('source_url', sourceUrl)
      .maybeSingle<GarmentRow>();
    if (error) throw new Error(`Loading garment failed: ${error.message}`);
    return data ? rowToGarment(data) : null;
  };

  const existing = await findExisting();
  if (existing) return NextResponse.json(existing);

  let garment;
  try {
    garment = await normalize();
  } catch (e) {
    return jsonError(502, `Normalization failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!garment) return unsupported();

  const { data, error } = await admin
    .from('garments')
    .insert(garmentToRow({ ...garment, id: randomUUID() }))
    .select('*')
    .single<GarmentRow>();
  if (error) {
    // A concurrent ingest of the same page won the unique source_url race.
    if (error.code === '23505') {
      const winner = await findExisting();
      if (winner) return NextResponse.json(winner);
    }
    throw new Error(`Saving garment failed: ${error.message}`);
  }
  return NextResponse.json(rowToGarment(data), { status: 201 });
}
