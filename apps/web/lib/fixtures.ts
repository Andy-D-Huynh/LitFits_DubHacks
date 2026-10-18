import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CategorySchema,
  GarmentFixtureSchema,
  ProfileSchema,
  type Garment,
  type GarmentFixture,
  type Profile,
} from '@fitmirror/shared';

// Demo-mode data read from the repo's fixtures/ directory. process.cwd() is
// apps/web in dev and on Vercel; next.config.ts traces fixtures/ into the
// server bundle so dynamic routes can read it at runtime.
const FIXTURES_DIR = join(process.cwd(), '../../fixtures');
const FIXTURE_CREATED_AT = '2026-10-17T00:00:00+00:00';

export function fixtureToGarment({ placeholder, ...rest }: GarmentFixture): Garment {
  return { ...rest, isPlaceholder: placeholder, createdAt: FIXTURE_CREATED_AT };
}

let garments: Garment[] | undefined;

export function loadFixtureGarments(): Garment[] {
  if (!garments) {
    const dir = join(FIXTURES_DIR, 'garments');
    const order = CategorySchema.options;
    garments = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) =>
        fixtureToGarment(
          GarmentFixtureSchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))),
        ),
      )
      .sort(
        (a, b) =>
          order.indexOf(a.category) - order.indexOf(b.category) ||
          (a.name ?? '').localeCompare(b.name ?? ''),
      );
  }
  return garments;
}

export function findFixtureGarment(id: string): Garment | undefined {
  return loadFixtureGarments().find((g) => g.id === id);
}

let demoProfile: Profile | undefined;

export function loadDemoProfile(): Profile {
  demoProfile ??= ProfileSchema.parse(
    JSON.parse(readFileSync(join(FIXTURES_DIR, 'profiles/demo.json'), 'utf8')),
  );
  return demoProfile;
}
