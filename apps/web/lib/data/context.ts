import 'server-only';
import type { Profile } from '@fitmirror/shared';
import type { User } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { isDemo } from '../demo';
import { loadDemoProfile } from '../fixtures';
import { currentUser, supabaseForRequest, type RequestAuth } from '../supabase/request';
import type { GarmentSource } from './garments';
import { getProfileById } from './profiles';

// Per-request data context shared by the API routes: demo mode (fixtures, no
// auth, no network) or a signed-in caller whose queries run under RLS.
export type ApiContext =
  | { demo: true; garments: GarmentSource }
  | { demo: false; garments: GarmentSource; auth: RequestAuth; user: User };

export async function apiContext(req: NextRequest): Promise<ApiContext | null> {
  if (isDemo(req.nextUrl.searchParams)) return { demo: true, garments: { demo: true } };
  const auth = await supabaseForRequest(req);
  const user = await currentUser(auth);
  if (!user) return null;
  return { demo: false, garments: { demo: false, supabase: auth.supabase }, auth, user };
}

export async function loadProfile(ctx: ApiContext, id: string): Promise<Profile | null> {
  if (ctx.demo) {
    const demo = loadDemoProfile();
    return demo.id === id ? demo : null;
  }
  return getProfileById(ctx.auth.supabase, id);
}
