import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rememberLikedLink } from '@/lib/cart/liked-garments';
import { renderNanoBananaTryOn } from '@/lib/tryon/nano-banana';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BodySchema = z.object({
  modelImage: z.string().min(1),
  garmentImage: z.string().min(1),
  productUrl: z.string().url(),
  name: z.string().min(1).max(200),
  retailer: z.string().max(80).nullable().optional(),
  category: z.string().max(40).optional(),
  size: z.string().min(1).max(40).optional(),
  sizes: z.array(z.string().min(1).max(40)).max(40).optional(),
  color: z.string().max(80).nullable().optional(),
});

export async function POST(req: Request) {
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
  try {
    const imageUrl = await renderNanoBananaTryOn({
      modelImage: body.modelImage,
      garmentImage: body.garmentImage,
      name: body.name,
      category: body.category,
      size: body.size,
      sizes: body.sizes,
      color: body.color,
    });
    const cart = await rememberLikedLink({
      id: crypto.randomUUID(),
      productUrl: body.productUrl,
      name: body.name,
      garmentImageUrl: body.garmentImage.startsWith('data:') ? body.productUrl : body.garmentImage,
      retailer: body.retailer ?? null,
      addedAt: new Date().toISOString(),
    });
    return NextResponse.json({ imageUrl, cart });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Try-on failed';
    const status = message.includes('FAL_KEY') ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
