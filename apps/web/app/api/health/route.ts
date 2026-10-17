import { NextResponse, type NextRequest } from 'next/server';
import { isDemo } from '@/lib/demo';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

type SupabaseStatus = 'not_configured' | 'reachable' | 'unreachable';

async function supabaseStatus(): Promise<SupabaseStatus> {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey } = env();
  if (!url || !anonKey) return 'not_configured';
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    return res.ok ? 'reachable' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    demo: isDemo(req.nextUrl.searchParams),
    supabase: await supabaseStatus(),
  });
}
