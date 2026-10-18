import { NextResponse } from 'next/server';
import { readLikedLinks } from '@/lib/cart/liked-garments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Product links saved when the user tries a piece on. */
export async function GET() {
  const cart = await readLikedLinks();
  return NextResponse.json({ cart });
}
