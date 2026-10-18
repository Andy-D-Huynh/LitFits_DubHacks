import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CategorySchema, GarmentFixtureSchema, type GarmentFixture } from '@fitmirror/shared';

// Reads fixtures/garments at build time (pages using this are static), so no
// runtime file tracing is needed. process.cwd() is apps/web in dev and on Vercel.
export function loadGarmentFixtures(): GarmentFixture[] {
  const dir = join(process.cwd(), '../../fixtures/garments');
  const order = CategorySchema.options;
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => GarmentFixtureSchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))))
    .sort(
      (a, b) =>
        order.indexOf(a.category) - order.indexOf(b.category) ||
        (a.name ?? '').localeCompare(b.name ?? ''),
    );
}
