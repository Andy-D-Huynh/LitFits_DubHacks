import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GarmentFixtureSchema } from '@fitmirror/shared';
import { describe, expect, it } from 'vitest';
import { garmentToRow, rowToGarment } from './garments';

const fixturePath = join(import.meta.dirname, '../../../../fixtures/garments/top-crew-tee.json');
const createdAt = '2026-10-17T00:00:00+00:00';

function loadFixtureGarment() {
  const { placeholder, ...rest } = GarmentFixtureSchema.parse(
    JSON.parse(readFileSync(fixturePath, 'utf8')),
  );
  return { ...rest, isPlaceholder: placeholder };
}

describe('garment row mapping', () => {
  it('round-trips a fixture through the DB row shape', () => {
    const garment = loadFixtureGarment();
    const row = { ...garmentToRow(garment), created_at: createdAt };
    expect(row.is_placeholder).toBe(true);
    expect(rowToGarment(row)).toEqual({ ...garment, createdAt });
  });

  it('coerces numeric extraction_confidence strings from Postgres', () => {
    const row = {
      ...garmentToRow(loadFixtureGarment()),
      extraction_confidence: '0.9' as unknown as number,
      created_at: createdAt,
    };
    expect(rowToGarment(row).extractionConfidence).toBe(0.9);
  });
});
