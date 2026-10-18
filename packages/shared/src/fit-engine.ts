import { MEASUREMENT_FOR_DIM, bodyCmForDim } from './dims';
import * as R from './fit-rules';
import type {
  Category,
  ConfidenceLevel,
  Dim,
  DimResult,
  DimValue,
  FitResult,
  FitPreference,
  FitType,
  FitVerdict,
  Garment,
  Profile,
  SizeResult,
  SizeRow,
  Stretch,
} from './types';

// Pure and deterministic: no I/O, no randomness. Algorithm and decisions in
// docs/fit-engine.md; every tunable number lives in fit-rules.ts.

export type FitGarment = Pick<
  Garment,
  | 'id'
  | 'category'
  | 'fitType'
  | 'stretch'
  | 'chartType'
  | 'measurementBasis'
  | 'sizeChart'
  | 'extractionMethod'
>;
export type FitBody = Pick<Profile, 'measurements' | 'measurementSource' | 'fitPreference'>;

type Target = { band: R.Band; label: string };
type MissingDim = { dim: Dim; reason: 'chart' | 'profile' };
type DimEval = {
  result: DimResult;
  weight: number; // 0 for note-only dims
  score: number;
  distance: number; // cm outside the band, 0 when inside
  centerDistance: number; // cm from the middle of the band
};
type SizeEval = {
  result: SizeResult;
  index: number;
  missing: MissingDim[];
  qualifies: boolean;
  evaluatedCritical: Dim[];
  tightCritical: boolean;
  centerDistance: number; // main dim; Infinity when not evaluated
  problems: { dim: Dim; verdict: FitVerdict }[]; // non-good scored dims, weight order
};

const LABEL: Record<Dim, string> = {
  shoulder: 'Shoulder',
  chest: 'Chest',
  waist: 'Waist',
  hip: 'Hip',
  inseam: 'Inseam',
  length: 'Length',
  sleeve: 'Sleeve',
};

const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = ['high', 'medium', 'low'];

function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
}

function signed(n: number): string {
  const s = fmt(n);
  return s !== '0' && !s.startsWith('-') ? `+${s}` : s;
}

function verdictWord(dim: Dim, verdict: FitVerdict): string {
  if (dim !== 'inseam') return verdict;
  return verdict === 'tight' ? 'too short' : verdict === 'loose' ? 'too long' : verdict;
}

function scoredDims(category: Category): Dim[] {
  return Object.keys(R.WEIGHTS[category]) as Dim[];
}

function criticalDims(category: Category): Dim[] {
  return scoredDims(category).filter((d) => R.CRITICAL_DIMS.includes(d));
}

function targetFor(
  category: Category,
  dim: Dim,
  fitType: FitType,
  stretch: Stretch,
): Target | null {
  const fitLabel = `for ${fitType} fit`;
  const reduced = (band: R.Band, label = fitLabel): Target => {
    const cut = R.STRETCH_MIN_EASE_REDUCTION_CM[stretch];
    return cut === 0
      ? { band, label }
      : { band: [band[0] - cut, band[1]], label: `${label} (${stretch} stretch)` };
  };

  if (category === 'bottom') {
    if (dim === 'waist') {
      return stretch === 'none'
        ? { band: R.BOTTOM_WAIST_EASE, label: 'for a non-stretch waist' }
        : { band: R.BOTTOM_WAIST_EASE_STRETCH, label: 'for a stretch waist' };
    }
    if (dim === 'hip') return reduced(R.BOTTOM_HIP_EASE[fitType]);
    if (dim === 'inseam') return { band: R.BOTTOM_INSEAM_DIFF, label: '' };
    return null;
  }
  if (dim === 'chest' || dim === 'waist' || dim === 'shoulder') {
    const base = R.TOP_EASE[dim][fitType];
    if (category !== 'outerwear') return reduced(base);
    const offset = R.OUTERWEAR_EASE_OFFSET_CM[dim];
    return reduced([base[0] + offset, base[1] + offset], `for ${fitType}-fit outerwear`);
  }
  if (category === 'dress' && dim === 'hip') return reduced(R.BOTTOM_HIP_EASE[fitType]);
  return null;
}

function bandScore(distance: number): number {
  return distance === 0 ? 1 : Math.max(0, 1 - distance / R.SCORE_FALLOFF_CM);
}

// Flat (pit-to-pit) widths become circumferences.
function normalizeValue(dim: Dim, value: DimValue, flat: boolean): DimValue {
  if (!flat || !R.FLAT_DOUBLED_DIMS.includes(dim)) return value;
  return typeof value === 'number' ? value * 2 : [value[0] * 2, value[1] * 2];
}

function asRange(value: DimValue): [number, number] {
  return typeof value === 'number' ? [value, value] : [value[0], value[1]];
}

function evaluateGarmentDim(dim: Dim, value: DimValue, body: number, target: Target): DimEval {
  const garment = typeof value === 'number' ? value : (value[0] + value[1]) / 2;
  const ease = garment - body;
  const [min, max] = target.band;
  const distance = ease < min ? min - ease : ease > max ? ease - max : 0;
  const verdict: FitVerdict = ease < min ? 'tight' : ease > max ? 'loose' : 'good';
  const note =
    dim === 'inseam'
      ? `Inseam: ${signed(ease)} cm vs your inseam, target is ${fmt(min)} to ${fmt(max)}, so ${verdictWord(dim, verdict)}.`
      : `${LABEL[dim]}: ${fmt(ease)} cm of ease, target ${target.label} is ${fmt(min)} to ${fmt(max)}, so ${verdict}.`;
  return {
    result: { dim, bodyCm: body, garmentCm: garment, easeCm: ease, verdict, note },
    weight: 0,
    score: bandScore(distance),
    distance,
    centerDistance: Math.abs(ease - (min + max) / 2),
  };
}

function evaluateBodyDim(dim: Dim, value: DimValue, body: number): DimEval {
  const [lo, hi] = asRange(value);
  const verdict: FitVerdict = body < lo ? 'loose' : body > hi ? 'tight' : 'good';
  const distance = body < lo ? lo - body : body > hi ? body - hi : 0;
  const where = verdict === 'good' ? 'inside' : verdict === 'tight' ? 'above' : 'below';
  return {
    result: {
      dim,
      bodyCm: body,
      rangeCm: [lo, hi],
      verdict,
      note: `${LABEL[dim]}: your ${fmt(body)} cm is ${where} the size range ${fmt(lo)} to ${fmt(hi)}, so ${verdictWord(dim, verdict)}.`,
    },
    weight: 0,
    score: bandScore(distance),
    distance,
    centerDistance: Math.abs(body - (lo + hi) / 2),
  };
}

function evaluateSleeve(value: DimValue, body: number, bodyChart: boolean): DimResult {
  if (bodyChart) {
    const [lo, hi] = asRange(value);
    return {
      dim: 'sleeve',
      bodyCm: body,
      rangeCm: [lo, hi],
      verdict: 'unknown',
      note: `Sleeve: your ${fmt(body)} cm arm length vs size range ${fmt(lo)} to ${fmt(hi)}; not scored.`,
    };
  }
  const garment = typeof value === 'number' ? value : (value[0] + value[1]) / 2;
  return {
    dim: 'sleeve',
    bodyCm: body,
    garmentCm: garment,
    verdict: 'unknown',
    note: `Sleeve: ${fmt(garment)} cm vs your ${fmt(body)} cm arm length (${signed(garment - body)} cm); not scored.`,
  };
}

function overallVerdict(category: Category, evals: DimEval[], score: number): FitVerdict {
  if (evals.length === 0) return 'unknown';
  const tight = evals.some(
    (e) =>
      R.CRITICAL_DIMS.includes(e.result.dim) &&
      e.result.verdict === 'tight' &&
      e.distance > R.TIGHT_MARGIN_CM,
  );
  if (tight) return 'tight';
  const main = evals.find((e) => e.result.dim === R.MAIN_DIM[category]);
  if (main && main.result.verdict === 'loose' && main.distance > R.LOOSE_MARGIN_CM) return 'loose';
  if (score >= R.GOOD_SCORE_THRESHOLD) return 'good';
  // Direction of the dim losing the most weighted score.
  let worst = evals[0]!;
  for (const e of evals) {
    if (e.weight * (1 - e.score) > worst.weight * (1 - worst.score)) worst = e;
  }
  return worst.result.verdict;
}

function evaluateSize(
  index: number,
  row: SizeRow,
  garment: FitGarment,
  body: FitBody,
  fitType: FitType,
): SizeEval {
  const { category, stretch } = garment;
  const bodyChart = garment.chartType === 'body';
  const flat = garment.measurementBasis === 'flat';
  const evals: DimEval[] = [];
  const missing: MissingDim[] = [];

  for (const dim of scoredDims(category)) {
    const raw = row[dim as keyof Omit<SizeRow, 'label'>];
    const bodyCm = bodyCmForDim(body.measurements, dim);
    if (raw === undefined) {
      missing.push({ dim, reason: 'chart' });
      continue;
    }
    if (bodyCm === undefined) {
      missing.push({ dim, reason: 'profile' });
      continue;
    }
    const value = normalizeValue(dim, raw, flat);
    let e: DimEval;
    if (bodyChart) {
      e = evaluateBodyDim(dim, value, bodyCm);
    } else {
      const target = targetFor(category, dim, fitType, stretch);
      if (!target) continue;
      e = evaluateGarmentDim(dim, value, bodyCm, target);
    }
    e.weight = R.WEIGHTS[category][dim] ?? 0;
    evals.push(e);
  }

  const dims: DimResult[] = evals.map((e) => e.result);
  for (const dim of R.NOTE_ONLY_DIMS) {
    const raw = row[dim as keyof Omit<SizeRow, 'label'>];
    const bodyCm = bodyCmForDim(body.measurements, dim);
    if (raw !== undefined && bodyCm !== undefined)
      dims.push(evaluateSleeve(raw, bodyCm, bodyChart));
  }

  const totalWeight = evals.reduce((s, e) => s + e.weight, 0);
  const score =
    totalWeight === 0
      ? 0
      : Math.min(1, evals.reduce((s, e) => s + e.weight * e.score, 0) / totalWeight);

  const evaluatedCritical = evals
    .map((e) => e.result.dim)
    .filter((d) => R.CRITICAL_DIMS.includes(d));
  const required = R.REQUIRED_DIMS[category] ?? [];
  const qualifies =
    evaluatedCritical.length >= R.MIN_CRITICAL_DIMS[category] &&
    required.every((d) => evaluatedCritical.includes(d));

  return {
    result: { size: row.label, overall: overallVerdict(category, evals, score), score, dims },
    index,
    missing,
    qualifies,
    evaluatedCritical,
    tightCritical: evals.some(
      (e) => R.CRITICAL_DIMS.includes(e.result.dim) && e.result.verdict === 'tight',
    ),
    centerDistance:
      evals.find((e) => e.result.dim === R.MAIN_DIM[category])?.centerDistance ?? Infinity,
    problems: evals
      .filter((e) => e.result.verdict !== 'good')
      .map((e) => ({ dim: e.result.dim, verdict: e.result.verdict })),
  };
}

function requirementText(category: Category): string {
  switch (category) {
    case 'top':
    case 'outerwear':
      return 'chest is needed';
    case 'bottom':
      return 'both waist and hip are needed';
    case 'dress':
      return 'at least two of chest, waist and hip are needed';
  }
}

function findBetweenSizes(
  rows: SizeRow[],
  garment: FitGarment,
  body: FitBody,
  sizes: SizeEval[],
): { lower: SizeEval; upper: SizeEval; dim: Dim } | null {
  const flat = garment.measurementBasis === 'flat';
  for (const dim of criticalDims(garment.category)) {
    const b = bodyCmForDim(body.measurements, dim);
    if (b === undefined) continue;
    for (let i = 0; i + 1 < rows.length; i++) {
      const a = rows[i]![dim as keyof Omit<SizeRow, 'label'>];
      const c = rows[i + 1]![dim as keyof Omit<SizeRow, 'label'>];
      if (a === undefined || c === undefined) continue;
      const [, aMax] = asRange(normalizeValue(dim, a, flat));
      const [cMin] = asRange(normalizeValue(dim, c, flat));
      const lower = sizes[i]!;
      const upper = sizes[i + 1]!;
      if (aMax < b && b < cMin && lower.qualifies && upper.qualifies) return { lower, upper, dim };
    }
  }
  return null;
}

function confidenceFor(garment: FitGarment, body: FitBody, rec: SizeEval): ConfidenceLevel {
  const sources = rec.evaluatedCritical.map((d) => {
    const key = MEASUREMENT_FOR_DIM[d];
    return (key && body.measurementSource?.[key]) ?? 'manual';
  });
  let base: ConfidenceLevel;
  if (garment.extractionMethod === 'llm_vision') base = 'low';
  else if (sources.includes('photo')) base = 'medium';
  else if (
    garment.chartType === 'garment' &&
    (garment.extractionMethod === 'dom' || garment.extractionMethod === 'fixture')
  )
    base = 'high';
  else base = 'medium';
  const level = Math.min(CONFIDENCE_LEVELS.indexOf(base) + rec.missing.length, 2);
  return CONFIDENCE_LEVELS[level]!;
}

// Lower is better: overall verdict, then any tight critical dim, then score,
// then closeness to the middle of the main dim's band, then fit preference.
function rankSizes(sizes: SizeEval[], preference: FitPreference): SizeEval {
  const sorted = [...sizes].sort(
    (a, b) =>
      R.VERDICT_RANK[a.result.overall] - R.VERDICT_RANK[b.result.overall] ||
      Number(a.tightCritical) - Number(b.tightCritical) ||
      (Math.abs(a.result.score - b.result.score) > R.SCORE_TIE_EPSILON
        ? b.result.score - a.result.score
        : 0) ||
      (a.centerDistance === b.centerDistance ? 0 : a.centerDistance - b.centerDistance) ||
      (preference === 'snug' ? a.index - b.index : b.index - a.index),
  );
  return sorted[0]!;
}

const PLACE: Partial<Record<Dim, string>> = {
  chest: 'the chest',
  waist: 'the waist',
  hip: 'the hip',
  shoulder: 'the shoulders',
};

export function problemPhrase({ dim, verdict }: { dim: Dim; verdict: FitVerdict }): string {
  if (dim === 'inseam') return `${verdictWord(dim, verdict)} in the inseam`;
  return `${verdict} at ${PLACE[dim] ?? LABEL[dim].toLowerCase()}`;
}

function noGoodFitLine(rec: SizeEval): string {
  const issues = rec.problems.map(problemPhrase);
  const detail =
    issues.length === 0
      ? ''
      : issues.length === 1
        ? `, but it is ${issues[0]}`
        : `, but it is ${issues.slice(0, -1).join(', ')} and ${issues[issues.length - 1]}`;
  return `No size fits well. The closest is ${rec.result.size}${detail}.`;
}

function missingLine({ dim, reason }: MissingDim): string {
  const name = LABEL[dim].toLowerCase();
  return reason === 'chart'
    ? `${LABEL[dim]} not checked: the size chart has no ${name}.`
    : `${LABEL[dim]} not checked: your profile has no ${name} measurement.`;
}

export function computeFit(garment: FitGarment, body: FitBody): FitResult {
  const noRecommendation = (warning: string): FitResult => ({
    garmentId: garment.id,
    recommendedSize: null,
    confidence: 'low',
    perSize: [],
    warnings: [warning],
  });

  const chart = garment.sizeChart;
  if (!chart || !garment.chartType) {
    return noRecommendation('No usable size chart, so no size can be recommended.');
  }
  if (garment.chartType === 'garment' && !garment.measurementBasis) {
    return noRecommendation(
      "The size chart doesn't say whether widths are flat or all the way around, so no size can be recommended.",
    );
  }

  const warnings: string[] = [];
  const fitType: FitType = garment.fitType ?? 'regular';
  if (!garment.fitType) warnings.push('Fit type unknown; using regular-fit targets.');

  const sizes = chart.rows.map((row, i) => evaluateSize(i, row, garment, body, fitType));
  const qualified = sizes.filter((s) => s.qualifies);

  let rec: SizeEval | null = null;
  if (qualified.length === 0) {
    warnings.push(
      `Not enough measurements to recommend a size: ${requirementText(garment.category)}.`,
    );
  } else {
    const between =
      garment.chartType === 'body' ? findBetweenSizes(chart.rows, garment, body, sizes) : null;
    if (between) {
      rec = body.fitPreference === 'snug' ? between.lower : between.upper;
      warnings.push(
        `Between ${between.lower.result.size} and ${between.upper.result.size} on ${between.dim}; recommending ${rec.result.size} for ${body.fitPreference} fit.`,
      );
    } else {
      rec = rankSizes(qualified, body.fitPreference);
    }
    if (rec.result.overall !== 'good') warnings.push(noGoodFitLine(rec));
  }

  for (const line of sizes.flatMap((s) => s.missing.map(missingLine))) {
    if (!warnings.includes(line)) warnings.push(line);
  }

  return {
    garmentId: garment.id,
    recommendedSize: rec ? rec.result.size : null,
    confidence: rec ? confidenceFor(garment, body, rec) : 'low',
    perSize: sizes.map((s) => s.result),
    warnings,
  };
}
