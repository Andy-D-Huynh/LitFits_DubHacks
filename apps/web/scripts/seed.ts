// Loads fixtures/garments/*.json into the garments table. Idempotent (upsert on id).
// Usage: pnpm --filter @fitmirror/web seed   (reads apps/web/.env.local)
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GarmentFixtureSchema } from '@fitmirror/shared';
import { createClient } from '@supabase/supabase-js';
import { garmentToRow } from '../lib/db/garments';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local',
  );
  process.exit(1);
}

const dir = join(import.meta.dirname, '../../../fixtures/garments');
const rows = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    // `placeholder` has no column; fixtures stay the record of which rows are placeholders.
    const { placeholder: _p, ...garment } = GarmentFixtureSchema.parse(
      JSON.parse(readFileSync(join(dir, f), 'utf8')),
    );
    return garmentToRow(garment);
  });

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const { error } = await supabase.from('garments').upsert(rows, { onConflict: 'id' });
if (error) {
  console.error('Seed failed:', error.message);
  process.exit(1);
}
console.log(`Seeded ${rows.length} garments.`);
