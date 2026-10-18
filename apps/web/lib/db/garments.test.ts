import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GarmentFixtureSchema } from '@fitmirror/shared';
import { describe, expect, it } from 'vitest';
import { garmentToRow, rowToGarment } from './garments';

const fixturePath = join(import.meta.dirname, '../../../../fixtures/garments/top-crew-tee.json');

describe('garment row mapping', () => {
  it('round-trips a fixture through the DB row shape', () => {
    const { placeholder: _p, ...garment } = GarmentFixtureSchema.parse(
      JSON.parse(readFileSync(fixturePath, 'utf8')),
    );
    const createdAt = '2026-10-17T00:00:00+00:00';
    const back = rowToGarment({ ...garmentToRow(garment), created_at: createdAt });
    expect(back).toEqual({ ...garment, createdAt });
  });

  it('coerces numeric extraction_confidence strings from Postgres', () => {
    const { placeholder: _p, ...garment } = GarmentFixtureSchema.parse(
      JSON.parse(readFileSync(fixturePath, 'utf8')),
    );
    const row = {
      ...garmentToRow(garment),
      extraction_confidence: '0.9' as unknown as number,
      created_at: '2026-10-17T00:00:00+00:00',
    };
    expect(rowToGarment(row).extractionConfidence).toBe(0.9);
  });
});
