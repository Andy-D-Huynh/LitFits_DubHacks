import { FitPanel } from '@/components/fit-panel';
import { loadGarmentFixtures } from '@/lib/fixtures';
import { HARDCODED_MEASUREMENTS } from '@/lib/hardcoded-body';

// Fixtures are read at build time.
export const dynamic = 'force-static';

export default function StudioPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Studio</h1>
      <FitPanel garments={loadGarmentFixtures()} measurements={HARDCODED_MEASUREMENTS} />
    </main>
  );
}
