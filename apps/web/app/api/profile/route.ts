import { ProfileInputSchema, ProfileSchema } from '@fitmirror/shared';
import { NextResponse, type NextRequest } from 'next/server';
import { getOwnProfile, saveOwnProfile } from '@/lib/data/profiles';
import { profileInputToRow } from '@/lib/db/profiles';
import { isDemo } from '@/lib/demo';
import { loadDemoProfile } from '@/lib/fixtures';
import { jsonError, parseBody } from '@/lib/http';
import { currentUser, ensureUser, supabaseForRequest } from '@/lib/supabase/request';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (isDemo(req.nextUrl.searchParams)) return NextResponse.json(loadDemoProfile());
  const auth = await supabaseForRequest(req);
  if (!(await currentUser(auth))) return jsonError(401, 'Not signed in');
  const profile = await getOwnProfile(auth.supabase);
  return profile ? NextResponse.json(profile) : jsonError(404, 'No profile yet');
}

// Creates or updates the caller's profile. Signs the visitor in anonymously
// on first use. Manual edits mark every provided measurement as manual.
export async function PUT(req: NextRequest) {
  const body = await parseBody(req, ProfileInputSchema);
  if ('response' in body) return body.response;

  if (isDemo(req.nextUrl.searchParams)) {
    // No network in demo mode: echo the demo profile with the edits applied, unsaved.
    const demo = loadDemoProfile();
    return NextResponse.json(
      ProfileSchema.parse({
        ...demo,
        heightCm: body.data.heightCm,
        fitPreference: body.data.fitPreference,
        measurements: body.data.measurements,
        measurementSource: profileInputToRow(body.data).measurement_source,
      }),
    );
  }

  const auth = await supabaseForRequest(req);
  let user;
  try {
    user = await ensureUser(auth);
  } catch (e) {
    // e.g. anonymous sign-ins disabled in the Supabase project's Auth settings.
    return jsonError(503, e instanceof Error ? e.message : 'Sign-in failed');
  }
  if (!user) return jsonError(401, 'Invalid access token');
  const { profile, created } = await saveOwnProfile(auth.supabase, user.id, body.data);
  return NextResponse.json(profile, { status: created ? 201 : 200 });
}
