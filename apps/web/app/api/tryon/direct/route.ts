import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rememberLikedLink, readLikedLinks } from '@/lib/cart/liked-garments';
import { isDemo } from '@/lib/demo';
import { env } from '@/lib/env';
import { jsonError } from '@/lib/http';
import { TRYON_PLACEHOLDER_URL } from '@/lib/providers/tryon/mock';
import {
  DEFAULT_FAL_TRYON_MODEL,
  FalTryOn,
  falCategoryFromText,
  falSubscribeWithKey,
} from '@/lib/providers/tryon/fal';
import { clientIp, createRateLimiter } from '@/lib/rate-limit';
import { createResultCache, directCacheKey } from '@/lib/tryon/direct';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// The Chrome extension prototype's try-on: no session, images sent inline,
// waits for fal and returns the image. Unlike POST /api/tryon it has no
// profile, so it gets an in-memory cache and a per-IP limit instead of the
// render cache and per-profile budget, and it is off in production unless
// TRYON_DIRECT_ENABLED=true. See docs/tryon.md.

const BodySchema = z.object({
  modelImage: z.string().min(1),
  garmentImage: z.string().min(1),
  productUrl: z.string().url(),
  name: z.string().min(1).max(200),
  retailer: z.string().max(80).nullable().optional(),
  category: z.string().max(40).optional(),
});

const cache = createResultCache();
let limiter: ReturnType<typeof createRateLimiter> | undefined;

export async function POST(req: Request) {
  const config = env();
  if (process.env.NODE_ENV === 'production' && !config.TRYON_DIRECT_ENABLED)
    return jsonError(404, 'Not found');

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid try-on request' }, { status: 400 });
  }
  const body = parsed.data;
  const category = falCategoryFromText(body.category);

  let imageUrl: string;
  if (isDemo(new URL(req.url).searchParams)) {
    imageUrl = TRYON_PLACEHOLDER_URL;
  } else {
    if (!config.FAL_KEY) return jsonError(503, 'FAL_KEY is not set on the server');
    const key = directCacheKey(body.modelImage, body.garmentImage, category);
    const hit = cache.get(key);
    if (hit) {
      imageUrl = hit;
    } else {
      limiter ??= createRateLimiter(config.TRYON_DAILY_LIMIT, 24 * 60 * 60 * 1000);
      const allowed = limiter(clientIp(req.headers));
      if (!allowed.ok)
        return NextResponse.json(
          { error: 'Try-on limit reached; try again later' },
          { status: 429, headers: { 'Retry-After': String(allowed.retryAfterS) } },
        );
      try {
        const provider = new FalTryOn(
          falSubscribeWithKey(config.FAL_KEY),
          config.TRYON_MODEL ?? DEFAULT_FAL_TRYON_MODEL,
        );
        ({ imageUrl } = await provider.renderImages({
          modelImage: body.modelImage,
          garmentImage: body.garmentImage,
          category,
        }));
        cache.set(key, imageUrl);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Try-on failed';
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }
  }

  // The cart file is a local-dev convenience; a read-only filesystem (Vercel)
  // must not fail a render that has already been paid for. The extension keeps
  // its own copy of these links.
  const link = {
    id: crypto.randomUUID(),
    productUrl: body.productUrl,
    name: body.name,
    garmentImageUrl: body.garmentImage.startsWith('data:') ? body.productUrl : body.garmentImage,
    retailer: body.retailer ?? null,
    addedAt: new Date().toISOString(),
  };
  const cart = await rememberLikedLink(link).catch(() => readLikedLinks());
  return NextResponse.json({ imageUrl, cart });
}
