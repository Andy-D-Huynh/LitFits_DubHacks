import 'server-only';
import type { Profile } from '@fitmirror/shared';
import { env } from '../env';
import { signedPhotoUrl } from '../photos/storage';
import { createSupabaseAdminClient } from '../supabase/server';

// Signed URL for showing the owner their own (unblurred) model photo, or null
// when there is none or storage access isn't configured.
export async function ownPhotoUrl(profile: Profile | null): Promise<string | null> {
  if (!profile?.modelPhotoPath || !env().SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    return await signedPhotoUrl(createSupabaseAdminClient(), profile.modelPhotoPath);
  } catch {
    return null;
  }
}
