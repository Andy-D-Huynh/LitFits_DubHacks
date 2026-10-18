import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { CandidateSchema, locateAddToCart } from '@/lib/cart/locate-add-to-cart';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  url: z.string().url(),
  productName: z.string().max(200).default(''),
  candidates: z.array(CandidateSchema).min(1).max(300),
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
    return NextResponse.json({ error: 'Invalid locate request' }, { status: 400 });
  }

  const { GEMINI_API_KEY, GEMINI_MODEL } = env();
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not set' }, { status: 503 });
  }

  try {
    const result = await locateAddToCart(parsed.data, GEMINI_API_KEY, GEMINI_MODEL);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Locate failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
