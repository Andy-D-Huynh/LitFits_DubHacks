import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeFit, type FitBody, type FitGarment } from './fit-engine';
import { FitResultSchema, GarmentFixtureSchema } from './schemas';
import type { Measurements, SizeRow } from './types';

const ID = '00000000-0000-4000-8000-0000000000aa';

function garment(over: Partial<FitGarment> & { rows?: SizeRow[] } = {}): FitGarment {
  const { rows, ...rest } = over;
  return {
    id: ID,
    category: 'top',
    fitType: 'regular',
    stretch: 'none',
    chartType: 'garment',
    measurementBasis: 'circumference',
    extractionMethod: 'fixture',
    sizeChart: { unit: 'cm', rows: rows ?? [{ label: 'M', chest: 110 }] },
    ...rest,
  };
}

function body(measurements: Measurements, over: Partial<FitBody> = {}): FitBody {
  return { measurements, measurementSource: null, fitPreference: 'regular', ...over };
}

const dim = (r: ReturnType<typeof computeFit>, size: string, d: string) =>
  r.perSize.find((s) => s.size === size)?.dims.find((x) => x.dim === d);

describe('garment charts', () => {
  it('scores ease inside the band as good', () => {
    const r = computeFit(
      garment({ rows: [{ label: 'M', chest: 110, shoulder: 47 }] }),
      body({ chest: 98, shoulder_width: 46 }),
    );
    expect(r.recommendedSize).toBe('M');
    expect(r.perSize[0]).toMatchObject({ overall: 'good', score: 1 });
    expect(dim(r, 'M', 'chest')?.note).toBe(
      'Chest: 12 cm of ease, target for regular fit is 8 to 16, so good.',
    );
  });

  it('writes the explanation exactly as the spec example', () => {
    const r = computeFit(
      garment({ fitType: 'relaxed', rows: [{ label: 'M', chest: 104 }] }),
      body({ chest: 98 }),
    );
    expect(dim(r, 'M', 'chest')?.note).toBe(
      'Chest: 6 cm of ease, target for relaxed fit is 16 to 26, so tight.',
    );
  });

  it('marks ease below the band tight and above it loose', () => {
    const r = computeFit(
      garment({
        rows: [
          { label: 'S', chest: 104 },
          { label: 'XL', chest: 120 },
        ],
      }),
      body({ chest: 98 }),
    );
    expect(dim(r, 'S', 'chest')?.verdict).toBe('tight');
    expect(dim(r, 'XL', 'chest')?.verdict).toBe('loose');
  });
});

describe('measurement basis', () => {
  it('doubles flat chest, waist and hip widths', () => {
    const flat = computeFit(
      garment({ measurementBasis: 'flat', rows: [{ label: 'M', chest: 55 }] }),
      body({ chest: 98 }),
    );
    const circ = computeFit(garment({ rows: [{ label: 'M', chest: 110 }] }), body({ chest: 98 }));
    expect(dim(flat, 'M', 'chest')).toEqual(dim(circ, 'M', 'chest'));
    expect(dim(flat, 'M', 'chest')?.easeCm).toBe(12);
  });

  it('does not double shoulder on a flat chart', () => {
    const r = computeFit(
      garment({ measurementBasis: 'flat', rows: [{ label: 'M', chest: 55, shoulder: 47 }] }),
      body({ chest: 98, shoulder_width: 46 }),
    );
    expect(dim(r, 'M', 'shoulder')?.easeCm).toBe(1);
  });
});

describe('stretch', () => {
  const tee = (stretch: 'none' | 'low' | 'high', chest: number) =>
    computeFit(garment({ stretch, rows: [{ label: 'M', chest }] }), body({ chest: 98 }));

  it('high stretch lowers minimum ease by 5 cm', () => {
    expect(dim(tee('none', 103), 'M', 'chest')?.verdict).toBe('tight');
    const high = dim(tee('high', 103), 'M', 'chest');
    expect(high?.verdict).toBe('good');
    expect(high?.note).toBe(
      'Chest: 5 cm of ease, target for regular fit (high stretch) is 3 to 16, so good.',
    );
  });

  it('low stretch lowers minimum ease by 2 cm', () => {
    expect(dim(tee('none', 104), 'M', 'chest')?.verdict).toBe('tight');
    expect(dim(tee('low', 104), 'M', 'chest')?.verdict).toBe('good');
  });

  it('a stretch bottom waist uses -4 to 2 with no further reduction', () => {
    const pants = (stretch: 'none' | 'high', waist: number) =>
      computeFit(
        garment({ category: 'bottom', stretch, rows: [{ label: '32', waist, hip: 107 }] }),
        body({ waist: 84, hip: 100 }),
      );
    expect(dim(pants('none', 81), '32', 'waist')?.verdict).toBe('tight');
    expect(dim(pants('high', 81), '32', 'waist')?.note).toBe(
      'Waist: -3 cm of ease, target for a stretch waist is -4 to 2, so good.',
    );
    // -5 would be good if the generic 5 cm reduction stacked; it does not.
    expect(dim(pants('high', 79), '32', 'waist')?.verdict).toBe('tight');
  });

  it('does not change the inseam band', () => {
    const r = computeFit(
      garment({
        category: 'bottom',
        stretch: 'high',
        rows: [{ label: '32', waist: 84, hip: 107, inseam: 77 }],
      }),
      body({ waist: 84, hip: 100, inseam: 81 }),
    );
    expect(dim(r, '32', 'inseam')?.note).toBe(
      'Inseam: -4 cm vs your inseam, target is -3 to 3, so too short.',
    );
  });
});

describe('overall verdict', () => {
  it('is tight when a critical dim is more than 3 cm under its minimum', () => {
    const r = computeFit(garment({ rows: [{ label: 'S', chest: 102 }] }), body({ chest: 98 }));
    expect(r.perSize[0]?.overall).toBe('tight');
  });

  it('is loose when the main dim is more than 6 cm over its maximum', () => {
    const r = computeFit(garment({ rows: [{ label: 'XL', chest: 121 }] }), body({ chest: 98 }));
    expect(r.perSize[0]?.overall).toBe('loose');
  });

  it('below 0.8 with no rule firing, follows the worst weighted dim', () => {
    // Chest good; shoulder 9 cm tight is not critical, so only the score sinks it.
    const r = computeFit(
      garment({ rows: [{ label: 'M', chest: 110, shoulder: 37 }] }),
      body({ chest: 98, shoulder_width: 46 }),
    );
    expect(r.perSize[0]?.score).toBeCloseTo(0.55 / 0.75, 10);
    expect(r.perSize[0]?.overall).toBe('tight');

    // Chest 6 cm over max: not more than 6, so the loose rule does not fire.
    const loose = computeFit(garment({ rows: [{ label: 'XL', chest: 120 }] }), body({ chest: 98 }));
    expect(loose.perSize[0]?.score).toBeCloseTo(0.4, 10);
    expect(loose.perSize[0]?.overall).toBe('loose');
  });
});

describe('body charts', () => {
  const knit = garment({
    chartType: 'body',
    fitType: 'relaxed',
    rows: [
      { label: 'S', chest: [84, 89], waist: [71, 76] },
      { label: 'M', chest: [90, 97], waist: [77, 84] },
      { label: 'XL', chest: [106, 113], waist: [93, 100] },
    ],
  });
  const r = computeFit(knit, body({ chest: 95, waist: 80 }));

  it('inside the range is good, above tight, below loose', () => {
    expect(dim(r, 'M', 'chest')?.note).toBe(
      'Chest: your 95 cm is inside the size range 90 to 97, so good.',
    );
    expect(dim(r, 'S', 'chest')?.note).toBe(
      'Chest: your 95 cm is above the size range 84 to 89, so tight.',
    );
    expect(dim(r, 'XL', 'chest')?.verdict).toBe('loose');
    expect(r.recommendedSize).toBe('M');
  });

  it('applies the tight and loose margins to the range', () => {
    expect(r.perSize.find((s) => s.size === 'S')?.overall).toBe('tight');
    expect(r.perSize.find((s) => s.size === 'XL')?.overall).toBe('loose');
  });

  const jean = garment({
    category: 'bottom',
    chartType: 'body',
    rows: [
      { label: '28', waist: [70, 73], hip: [88, 91] },
      { label: '30', waist: [74, 78], hip: [92, 96] },
    ],
  });

  it('between sizes, regular picks the larger and warns', () => {
    const res = computeFit(jean, body({ waist: 73.5, hip: 93 }));
    expect(res.recommendedSize).toBe('30');
    expect(res.warnings).toContain('Between 28 and 30 on waist; recommending 30 for regular fit.');
  });

  it('between sizes, snug picks the smaller', () => {
    const res = computeFit(jean, body({ waist: 73.5, hip: 93 }, { fitPreference: 'snug' }));
    expect(res.recommendedSize).toBe('28');
  });
});

describe('recommendation', () => {
  it('breaks score ties by fit preference', () => {
    const g = garment({
      rows: [
        { label: 'S', chest: 108 },
        { label: 'M', chest: 112 },
      ],
    });
    expect(computeFit(g, body({ chest: 98 })).recommendedSize).toBe('M');
    expect(computeFit(g, body({ chest: 98 }, { fitPreference: 'snug' })).recommendedSize).toBe('S');
  });

  it('ranks a loose size above a tight one even with a lower score', () => {
    // S: 5 cm ease (score 0.7, tight). L: 22 cm ease (score 0.4, loose).
    const r = computeFit(
      garment({
        rows: [
          { label: 'S', chest: 103 },
          { label: 'L', chest: 120 },
        ],
      }),
      body({ chest: 98 }),
    );
    expect(r.perSize.map((s) => s.overall)).toEqual(['tight', 'loose']);
    expect(r.recommendedSize).toBe('L');
  });

  it('prefers a size with no tight critical dim among good sizes', () => {
    // 32 scores higher but its waist is tight; 34's waist fits and only the hip is loose.
    const r = computeFit(
      garment({
        category: 'bottom',
        chartType: 'body',
        rows: [
          { label: '32', waist: [79, 83], hip: [97, 101], inseam: [80, 84] },
          { label: '34', waist: [84, 88], hip: [102, 106], inseam: [80, 84] },
        ],
      }),
      body({ waist: 84, hip: 99, inseam: 81 }),
    );
    expect(r.perSize.map((s) => s.overall)).toEqual(['good', 'good']);
    expect(r.perSize[0]!.score).toBeGreaterThan(r.perSize[1]!.score);
    expect(r.recommendedSize).toBe('34');
  });

  it('breaks score ties by closeness to the middle of the main band', () => {
    // Both score 1; L's 10 cm ease is nearer the 8–16 midpoint than XL's 16.
    const r = computeFit(
      garment({
        rows: [
          { label: 'L', chest: 108 },
          { label: 'XL', chest: 114 },
        ],
      }),
      body({ chest: 98 }),
    );
    expect(r.recommendedSize).toBe('L');
  });

  it('warns clearly when no size fits well', () => {
    const r = computeFit(
      garment({
        category: 'dress',
        chartType: 'body',
        rows: [{ label: 'L', chest: [93, 98], waist: [75, 80], hip: [101, 106] }],
      }),
      body({ chest: 98, waist: 84, hip: 99 }),
    );
    expect(r.recommendedSize).toBe('L');
    expect(r.warnings).toContain(
      'No size fits well. The closest is L, but it is tight at the waist and loose at the hip.',
    );
  });

  it('does not add the no-good-fit warning when the pick is good', () => {
    const r = computeFit(garment(), body({ chest: 98 }));
    expect(r.warnings.some((w) => w.startsWith('No size fits well'))).toBe(false);
  });

  it('recommends a chest-only top chart', () => {
    expect(computeFit(garment(), body({ chest: 98 })).recommendedSize).toBe('M');
  });

  it('returns null when a bottom has fewer than two critical dims', () => {
    const r = computeFit(
      garment({ category: 'bottom', rows: [{ label: '32', waist: 86 }] }),
      body({ waist: 84, hip: 100 }),
    );
    expect(r.recommendedSize).toBeNull();
    expect(r.confidence).toBe('low');
    expect(r.warnings).toContain(
      'Not enough measurements to recommend a size: both waist and hip are needed.',
    );
  });
});

describe('missing dims', () => {
  it('renormalizes weights over the evaluated dims and names what was not checked', () => {
    const r = computeFit(
      garment({ category: 'bottom', rows: [{ label: '32', waist: 86, hip: 107 }] }),
      body({ waist: 84, hip: 100, inseam: 81 }),
    );
    expect(r.perSize[0]?.score).toBe(1);
    expect(r.warnings).toContain('Inseam not checked: the size chart has no inseam.');
  });

  it('names dims missing from the profile', () => {
    const r = computeFit(
      garment({ category: 'bottom', rows: [{ label: '32', waist: 86, hip: 107, inseam: 81 }] }),
      body({ waist: 84, hip: 100 }),
    );
    expect(r.warnings).toContain('Inseam not checked: your profile has no inseam measurement.');
  });
});

describe('confidence', () => {
  const full = garment({ rows: [{ label: 'M', chest: 110, shoulder: 47, waist: 96 }] });
  const fullBody = { chest: 98, shoulder_width: 46, waist: 84 };

  it('is high for a fixture garment chart with manual dims and nothing missing', () => {
    expect(computeFit(full, body(fullBody)).confidence).toBe('high');
  });

  it('drops one level per missing scored dim', () => {
    const oneMissing = garment({ rows: [{ label: 'M', chest: 110, shoulder: 47 }] });
    expect(computeFit(oneMissing, body(fullBody)).confidence).toBe('medium');
    expect(computeFit(garment(), body(fullBody)).confidence).toBe('low');
  });

  it('is medium with photo dims and low for a vision-extracted chart', () => {
    expect(
      computeFit(full, body(fullBody, { measurementSource: { chest: 'photo' } })).confidence,
    ).toBe('medium');
    expect(computeFit({ ...full, extractionMethod: 'llm_vision' }, body(fullBody)).confidence).toBe(
      'low',
    );
  });

  it('never reaches high on a body chart', () => {
    const r = computeFit(
      garment({
        chartType: 'body',
        rows: [{ label: 'M', chest: [94, 100], shoulder: [45, 47], waist: [82, 86] }],
      }),
      body(fullBody),
    );
    expect(r.confidence).toBe('medium');
  });
});

describe('categories and note-only dims', () => {
  it('fits a dress with top bands plus the bottom hip band', () => {
    const r = computeFit(
      garment({ category: 'dress', rows: [{ label: 'M', chest: 110, waist: 94, hip: 107 }] }),
      body({ chest: 98, waist: 84, hip: 100 }),
    );
    expect(dim(r, 'M', 'hip')?.note).toBe(
      'Hip: 7 cm of ease, target for regular fit is 4 to 10, so good.',
    );
    expect(r.perSize[0]?.overall).toBe('good');
  });

  it('fits outerwear with the top bands shifted for layering', () => {
    const r = computeFit(garment({ category: 'outerwear' }), body({ chest: 98 }));
    expect(dim(r, 'M', 'chest')?.note).toBe(
      'Chest: 12 cm of ease, target for regular-fit outerwear is 14 to 22, so tight.',
    );
  });

  it('does not shift body-chart outerwear', () => {
    const r = computeFit(
      garment({
        category: 'outerwear',
        chartType: 'body',
        rows: [{ label: 'M', chest: [96, 100] }],
      }),
      body({ chest: 98 }),
    );
    expect(dim(r, 'M', 'chest')?.verdict).toBe('good');
  });

  it('reports sleeve as an unscored note', () => {
    const withSleeve = computeFit(
      garment({ rows: [{ label: 'M', chest: 110, sleeve: 64 }] }),
      body({ chest: 98, arm_length: 61 }),
    );
    expect(dim(withSleeve, 'M', 'sleeve')).toMatchObject({
      verdict: 'unknown',
      note: 'Sleeve: 64 cm vs your 61 cm arm length (+3 cm); not scored.',
    });
    expect(withSleeve.perSize[0]?.score).toBe(
      computeFit(garment(), body({ chest: 98 })).perSize[0]?.score,
    );
  });

  it('ignores length entirely', () => {
    const r = computeFit(
      garment({ rows: [{ label: 'M', chest: 110, length: 72 }] }),
      body({ chest: 98 }),
    );
    expect(dim(r, 'M', 'length')).toBeUndefined();
    expect(r.warnings.some((w) => w.startsWith('Length'))).toBe(false);
  });
});

describe('unusable input', () => {
  it('returns no recommendation without a chart', () => {
    const r = computeFit(garment({ sizeChart: null }), body({ chest: 98 }));
    expect(r).toMatchObject({ recommendedSize: null, confidence: 'low', perSize: [] });
    expect(r.warnings).toHaveLength(1);
  });

  it('refuses a garment chart with unknown basis', () => {
    const r = computeFit(garment({ measurementBasis: null }), body({ chest: 98 }));
    expect(r.recommendedSize).toBeNull();
    expect(r.perSize).toEqual([]);
  });

  it('uses regular targets and warns when fit type is unknown', () => {
    const r = computeFit(garment({ fitType: null }), body({ chest: 98 }));
    expect(r.warnings).toContain('Fit type unknown; using regular-fit targets.');
    expect(dim(r, 'M', 'chest')?.note).toContain('for regular fit');
  });
});

describe('purity', () => {
  it('is deterministic and does not mutate its input', () => {
    const g = garment({
      rows: [{ label: 'M', chest: 55, waist: [40, 42] }],
      measurementBasis: 'flat',
    });
    const b = body({ chest: 98, waist: 84 });
    const before = JSON.stringify([g, b]);
    expect(computeFit(g, b)).toEqual(computeFit(g, b));
    expect(JSON.stringify([g, b])).toBe(before);
  });
});

describe('fixtures', () => {
  const dir = join(import.meta.dirname, '../../../fixtures/garments');
  const sample = body({
    chest: 98,
    waist: 84,
    hip: 99,
    shoulder_width: 46,
    inseam: 81,
    arm_length: 63,
  });

  it.each(readdirSync(dir).filter((f) => f.endsWith('.json')))(
    '%s produces a valid result with notes',
    (file) => {
      const fixture = GarmentFixtureSchema.parse(JSON.parse(readFileSync(join(dir, file), 'utf8')));
      const r = FitResultSchema.parse(computeFit(fixture, sample));
      expect(r.perSize.length).toBeGreaterThan(0);
      for (const s of r.perSize) for (const d of s.dims) expect(d.note.length).toBeGreaterThan(0);
    },
  );
});
