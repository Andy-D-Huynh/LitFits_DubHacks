import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GarmentFixtureSchema } from '../packages/shared/src/schemas';

const dir = join(import.meta.dirname, 'garments');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const fixtures = files.map((f) => ({
  file: f,
  data: JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown,
}));

describe('garment fixtures', () => {
  it.each(fixtures)('$file matches GarmentFixtureSchema', ({ data }) => {
    const result = GarmentFixtureSchema.safeParse(data);
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it('has unique ids', () => {
    const ids = fixtures.map(({ data }) => GarmentFixtureSchema.parse(data).id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers 3 tops, 3 bottoms, 1 outerwear, 1 dress', () => {
    const counts: Record<string, number> = {};
    for (const { data } of fixtures) {
      const { category } = GarmentFixtureSchema.parse(data);
      counts[category] = (counts[category] ?? 0) + 1;
    }
    expect(counts).toEqual({ top: 3, bottom: 3, outerwear: 1, dress: 1 });
  });
});
