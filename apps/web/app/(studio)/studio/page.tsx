import Link from 'next/link';
import { StudioView } from '@/components/studio-view';
import { listGarments } from '@/lib/data/garments';
import { ownPhotoUrl } from '@/lib/data/photos';
import { getOwnProfile } from '@/lib/data/profiles';
import { isDemo } from '@/lib/demo';
import { loadDemoProfile } from '@/lib/fixtures';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = isDemo(await searchParams);
  const query = demo ? '?demo=1' : '';

  if (!demo && !isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p>
          Supabase isn&apos;t configured. Try <Link href="/studio?demo=1">demo mode</Link>.
        </p>
      </main>
    );
  }

  const supabase = demo ? null : await createSupabaseServerClient();
  const profile = supabase ? await getOwnProfile(supabase) : loadDemoProfile();
  const garments = await listGarments(supabase ? { demo: false, supabase } : { demo: true });

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Studio</h1>
      {profile ? (
        <StudioView
          garments={garments}
          body={{
            measurements: profile.measurements,
            measurementSource: profile.measurementSource,
            fitPreference: profile.fitPreference,
          }}
          profileId={profile.id}
          photoUrl={demo ? null : await ownPhotoUrl(profile)}
          demo={demo}
          editHref={`/onboarding${query}`}
        />
      ) : (
        <p>
          <Link className="underline" href={`/onboarding${query}`}>
            Enter your measurements
          </Link>{' '}
          to see which size fits.
        </p>
      )}
    </main>
  );
}
