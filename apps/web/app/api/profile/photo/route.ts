import { randomUUID } from 'node:crypto';
import { FALLBACK_HEAD_BOX, NormBoxSchema } from '@fitmirror/shared';
import { NextResponse, type NextRequest } from 'next/server';
import { getOwnProfile } from '@/lib/data/profiles';
import { isDemo } from '@/lib/demo';
import { env } from '@/lib/env';
import { jsonError } from '@/lib/http';
import {
  ACCEPTED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  PhotoError,
  blurRegion,
  processModelPhoto,
} from '@/lib/photos/process';
import { photoPaths, removePhotoPair, signedPhotoUrl, uploadPhotoPair } from '@/lib/photos/storage';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { currentUser, supabaseForRequest } from '@/lib/supabase/request';

export const dynamic = 'force-dynamic';

async function ownerContext(req: NextRequest) {
  if (isDemo(req.nextUrl.searchParams)) {
    return { response: jsonError(409, 'Model photos are not stored in demo mode') };
  }
  if (!env().SUPABASE_SERVICE_ROLE_KEY) {
    return {
      response: jsonError(503, 'Photo storage needs SUPABASE_SERVICE_ROLE_KEY on the server'),
    };
  }
  const auth = await supabaseForRequest(req);
  const user = await currentUser(auth);
  if (!user) return { response: jsonError(401, 'Not signed in') };
  const profile = await getOwnProfile(auth.supabase);
  if (!profile) return { response: jsonError(409, 'Save your measurements first') };
  return { auth, user, profile, admin: createSupabaseAdminClient() };
}

// Uploads one full-body photo (multipart field `photo`, optional `headBox` JSON
// from in-browser pose detection). Stores an EXIF-stripped original and a
// faceless copy; replaces any previous photo.
export async function POST(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ('response' in ctx) return ctx.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, 'Expected multipart form data');
  }
  const file = form.get('photo');
  if (!(file instanceof File)) return jsonError(400, 'Missing `photo` file');
  if (!(ACCEPTED_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return jsonError(415, 'Use a JPEG, PNG or WebP photo');
  }
  if (file.size > MAX_PHOTO_BYTES) return jsonError(413, 'Photo is larger than 10 MB');

  let headBox = FALLBACK_HEAD_BOX;
  let headBoxSource: 'pose' | 'fallback' = 'fallback';
  const rawBox = form.get('headBox');
  if (typeof rawBox === 'string' && rawBox) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBox);
    } catch {
      return jsonError(400, '`headBox` must be JSON');
    }
    const parsed = NormBoxSchema.safeParse(parsedJson);
    if (!parsed.success) return jsonError(400, 'Invalid `headBox`');
    headBox = parsed.data;
    headBoxSource = 'pose';
  }

  let photo;
  try {
    photo = await processModelPhoto(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return jsonError(422, e instanceof PhotoError ? e.message : "Couldn't read that image");
  }
  const faceless = await blurRegion(photo, headBox);

  const paths = photoPaths(ctx.user.id, randomUUID());
  await uploadPhotoPair(ctx.admin, paths, photo.jpeg, faceless);
  const { error } = await ctx.auth.supabase
    .from('profiles')
    .update({ model_photo_path: paths.original })
    .eq('id', ctx.profile.id);
  if (error) {
    await removePhotoPair(ctx.admin, paths.original);
    throw new Error(`Saving photo path failed: ${error.message}`);
  }
  if (ctx.profile.modelPhotoPath) {
    await removePhotoPair(ctx.admin, ctx.profile.modelPhotoPath).catch(() => undefined);
  }

  return NextResponse.json(
    {
      modelPhotoPath: paths.original,
      photoUrl: await signedPhotoUrl(ctx.admin, paths.original),
      headBoxSource,
    },
    { status: 201 },
  );
}

export async function DELETE(req: NextRequest) {
  const ctx = await ownerContext(req);
  if ('response' in ctx) return ctx.response;
  if (!ctx.profile.modelPhotoPath) return jsonError(404, 'No model photo');
  const { error } = await ctx.auth.supabase
    .from('profiles')
    .update({ model_photo_path: null })
    .eq('id', ctx.profile.id);
  if (error) throw new Error(`Clearing photo path failed: ${error.message}`);
  await removePhotoPair(ctx.admin, ctx.profile.modelPhotoPath);
  return new NextResponse(null, { status: 204 });
}
