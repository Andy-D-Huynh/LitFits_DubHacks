import 'server-only';
import type { Profile, ProfileInput } from '@fitmirror/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { profileInputToRow, rowToProfile, type ProfileRow } from '../db/profiles';

// One profile per user: the most recent row is the profile. RLS scopes every
// query to the caller, so no user_id filter is needed for reads.

export async function getOwnProfile(supabase: SupabaseClient): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<ProfileRow>();
  if (error) throw new Error(`Loading profile failed: ${error.message}`);
  return data ? rowToProfile(data) : null;
}

export async function saveOwnProfile(
  supabase: SupabaseClient,
  userId: string,
  input: ProfileInput,
): Promise<{ profile: Profile; created: boolean }> {
  const existing = await getOwnProfile(supabase);
  const values = profileInputToRow(input);
  const query = existing
    ? supabase.from('profiles').update(values).eq('id', existing.id)
    : supabase.from('profiles').insert({ ...values, user_id: userId });
  const { data, error } = await query.select('*').single<ProfileRow>();
  if (error) throw new Error(`Saving profile failed: ${error.message}`);
  return { profile: rowToProfile(data), created: !existing };
}

// RLS returns null for another user's profile, so callers can treat it as not found.
export async function getProfileById(
  supabase: SupabaseClient,
  id: string,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle<ProfileRow>();
  if (error) throw new Error(`Loading profile failed: ${error.message}`);
  return data ? rowToProfile(data) : null;
}
