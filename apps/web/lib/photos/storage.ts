import type { SupabaseClient } from '@supabase/supabase-js';

// Model photos live in the private model-photos bucket as a pair: the
// EXIF-stripped original (shown only to its owner) and a faceless copy with the
// head blurred, which is the only one sent to a try-on provider unless the
// profile opts in to face use. Storage has no user policies; every access goes
// through the service role and 10-minute signed URLs.

export const MODEL_PHOTOS_BUCKET = 'model-photos';
export const SIGNED_URL_SECONDS = 600;

export function photoPaths(ownerId: string, photoId: string) {
  const dir = `${ownerId}/${photoId}`;
  return { original: `${dir}/original.jpg`, faceless: `${dir}/faceless.jpg` };
}

export function facelessPathFor(originalPath: string): string {
  if (!originalPath.endsWith('/original.jpg')) {
    throw new Error(`Unexpected model photo path: ${originalPath}`);
  }
  return originalPath.replace(/original\.jpg$/, 'faceless.jpg');
}

export async function uploadPhotoPair(
  admin: SupabaseClient,
  paths: { original: string; faceless: string },
  original: Buffer,
  faceless: Buffer,
): Promise<void> {
  for (const [path, body] of [
    [paths.original, original],
    [paths.faceless, faceless],
  ] as const) {
    const { error } = await admin.storage
      .from(MODEL_PHOTOS_BUCKET)
      .upload(path, body, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(`Storing photo failed: ${error.message}`);
  }
}

export async function removePhotoPair(admin: SupabaseClient, originalPath: string): Promise<void> {
  const { error } = await admin.storage
    .from(MODEL_PHOTOS_BUCKET)
    .remove([originalPath, facelessPathFor(originalPath)]);
  if (error) throw new Error(`Removing photo failed: ${error.message}`);
}

export async function signedPhotoUrl(admin: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await admin.storage
    .from(MODEL_PHOTOS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw new Error(`Signing photo URL failed: ${error.message}`);
  return data.signedUrl;
}

// The image a try-on provider receives: faceless unless the user opted in.
export function tryOnPhotoPath(profile: { modelPhotoPath: string; faceOptIn: boolean }): string {
  return profile.faceOptIn ? profile.modelPhotoPath : facelessPathFor(profile.modelPhotoPath);
}
