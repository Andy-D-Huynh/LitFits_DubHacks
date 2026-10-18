import { FitDirectRequestSchema } from '@fitmirror/shared';
import { NextResponse, type NextRequest } from 'next/server';
import { fitDirect } from '@/lib/fit/direct';
import { jsonError, parseBody } from '@/lib/http';
import { clientIp, createRateLimiter } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const limit = createRateLimiter(60, 60_000); // 60 fits per minute per IP

// The extension calls this from its chrome-extension:// origin.
function cors(req: NextRequest, res: NextResponse): NextResponse {
  const origin = req.headers.get('origin');
  if (origin?.startsWith('chrome-extension://')) {
    res.headers.set('access-control-allow-origin', origin);
    res.headers.set('access-control-allow-methods', 'POST, OPTIONS');
    res.headers.set('access-control-allow-headers', 'content-type');
    res.headers.set('vary', 'origin');
  }
  return res;
}

export function OPTIONS(req: NextRequest) {
  return cors(req, new NextResponse(null, { status: 204 }));
}

// Session-less fit: measurements and the garment's size chart come in the
// body, the FitResult goes back, nothing is stored or logged. Same engine as
// POST /api/fit. Works the same in demo mode (no network involved).
export async function POST(req: NextRequest) {
  return cors(req, await handle(req));
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const rate = limit(clientIp(req.headers));
  if (!rate.ok) {
    const res = jsonError(429, 'Too many fit requests; slow down');
    res.headers.set('retry-after', String(rate.retryAfterS));
    return res;
  }
  const body = await parseBody(req, FitDirectRequestSchema);
  if ('response' in body) return body.response;
  return NextResponse.json(fitDirect(body.data));
}
