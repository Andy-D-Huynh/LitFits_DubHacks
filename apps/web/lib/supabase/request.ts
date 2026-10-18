import 'server-only';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { env } from '../env';
import { createSupabaseServerClient } from './server';

// Route handlers accept either the web app's cookie session or an
// `Authorization: Bearer <access token>` header (the extension, scripts).
export type RequestAuth = { supabase: SupabaseClient; bearer: string | null };

export async function supabaseForRequest(req: NextRequest): Promise<RequestAuth> {
  const header = req.headers.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) {
    const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey } = env();
    if (!url || !anonKey) throw new Error('Supabase is not configured');
    const bearer = header.slice('bearer '.length).trim();
    const supabase = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return { supabase, bearer };
  }
  return { supabase: await createSupabaseServerClient(), bearer: null };
}

export async function currentUser({ supabase, bearer }: RequestAuth): Promise<User | null> {
  const { data, error } = bearer
    ? await supabase.auth.getUser(bearer)
    : await supabase.auth.getUser();
  return error ? null : data.user;
}

// Signs the visitor in anonymously when there is no session yet (cookie mode
// only; a bad bearer token is a 401, not a new account).
export async function ensureUser(auth: RequestAuth): Promise<User | null> {
  const user = await currentUser(auth);
  if (user || auth.bearer) return user;
  const { data, error } = await auth.supabase.auth.signInAnonymously();
  if (error) throw new Error(`Anonymous sign-in failed: ${error.message}`);
  return data.user;
}
