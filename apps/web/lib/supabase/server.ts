import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { env } from '../env';

function requireSupabase() {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey } = env();
  if (!url || !anonKey) throw new Error('Supabase is not configured (see apps/web/.env.example)');
  return { url, anonKey };
}

// Per-request client acting as the signed-in (anonymous) user; RLS applies.
export async function createSupabaseServerClient() {
  const { url, anonKey } = requireSupabase();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only.
        }
      },
    },
  });
}

// Service-role client that bypasses RLS. Only for trusted server work such as
// writing to the shared garments catalog.
export function createSupabaseAdminClient() {
  const { url } = requireSupabase();
  const serviceKey = env().SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
