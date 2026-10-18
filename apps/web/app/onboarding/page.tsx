import type { Profile } from '@fitmirror/shared';
import { MeasurementForm } from '@/components/measurement-form';
import { getOwnProfile } from '@/lib/data/profiles';
import { isDemo } from '@/lib/demo';
import { loadDemoProfile } from '@/lib/fixtures';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = isDemo(await searchParams);
  let profile: Profile | null = null;
  if (demo) profile = loadDemoProfile();
  else if (isSupabaseConfigured())
    profile = await getOwnProfile(await createSupabaseServerClient());

  return (
    <main className="mx-auto max-w-xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Your measurements</h1>
      <MeasurementForm initial={profile} demo={demo} />
    </main>
  );
}
