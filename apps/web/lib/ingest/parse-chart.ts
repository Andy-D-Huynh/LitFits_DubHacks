import {
  RawSizeChartSchema,
  type ChartType,
  type Dim,
  type DimValue,
  type LengthUnit,
  type MeasurementBasis,
  type RawSizeChart,
  type SizeRow,
} from '@fitmirror/shared';

// Deterministic size-chart table parser for the DOM extraction path (no LLM).
// Returns null rather than guessing when the unit or layout is unclear.

export type ParsedChart = {
  chart: RawSizeChart;
  chartType: ChartType | null;
  measurementBasis: MeasurementBasis | null;
};

const DIM_PATTERNS: [Dim, RegExp][] = [
  ['chest', /\b(chest|bust|pit[- ]to[- ]pit|width)\b/i],
  ['waist', /\bwaist\b/i],
  ['hip', /\b(hips?|seat)\b/i],
  ['inseam', /\b(inseam|inside leg)\b/i],
  ['shoulder', /\bshoulders?\b/i],
  ['sleeve', /\bsleeves?\b/i],
  ['length', /\b(length|body length|back length)\b/i],
];
const LABEL_PATTERN = /\b(size|sizes)\b/i;

function decode(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function tableRows(html: string): string[][] {
  const table = /<table[\s\S]*?<\/table>/i.exec(html)?.[0];
  if (!table) return [];
  return [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)]
    .map((tr) =>
      [...tr[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => decode(c[1] ?? '')),
    )
    .filter((cells) => cells.length > 1);
}

function dimFor(header: string): Dim | null {
  for (const [dim, re] of DIM_PATTERNS) if (re.test(header)) return dim;
  return null;
}

// "38", "38.5", "38-40", "38 – 40", "38 to 40" → number or [min, max].
export function parseValue(cell: string): DimValue | null {
  const nums =
    cell
      .replace(/,/g, '.')
      .match(/\d+(?:\.\d+)?/g)
      ?.map(Number) ?? [];
  if (nums.length === 1) return nums[0]! > 0 ? nums[0]! : null;
  if (nums.length === 2 && /[-–—]|to/i.test(cell)) {
    const [a, b] = nums as [number, number];
    return a > 0 && b > 0 ? [Math.min(a, b), Math.max(a, b)] : null;
  }
  return null;
}

// "in" alone is an ordinary word, so inches need "inch", "(in)", "in." or 38".
function detectUnit(text: string): LengthUnit | null {
  const cm = /\b(cm|centimet(er|re)s?)\b/i.test(text);
  const inch = /\binch(es)?\b|\(\s*in\s*\)|\bin\.(?=\s|$)|\d\s*(?:"|″)/i.test(text);
  if (cm && !inch) return 'cm';
  if (inch && !cm) return 'in';
  return null;
}

function detectBasis(text: string, chartType: ChartType | null): MeasurementBasis | null {
  if (/\b(laid flat|lying flat|flat measurement|pit[- ]to[- ]pit|half chest)\b/i.test(text)) {
    return 'flat';
  }
  if (/\bcircumference\b/i.test(text) || chartType === 'body') return 'circumference';
  return null;
}

function detectChartType(text: string, hasRanges: boolean): ChartType | null {
  if (/\b(garment|product) measurements?\b|\bmeasured (flat|across)\b/i.test(text))
    return 'garment';
  if (hasRanges || /\bbody measurements?\b|\bto fit\b/i.test(text)) return 'body';
  return null;
}

export function parseSizeChart(chartHtml: string, pageText = ''): ParsedChart | null {
  let rows = tableRows(chartHtml);
  if (rows.length < 2) return null;

  // Sizes may be rows (header = dims) or columns (first column = dims).
  const headerDims = rows[0]!.map(dimFor).filter(Boolean).length;
  const columnDims = rows.map((r) => dimFor(r[0] ?? '')).filter(Boolean).length;
  if (columnDims > headerDims) {
    rows = rows[0]!.map((_, c) => rows.map((r) => r[c] ?? ''));
  }

  const header = rows[0]!;
  const dims = header.map((h, i) => (i === 0 || LABEL_PATTERN.test(h) ? null : dimFor(h)));
  if (!dims.some(Boolean)) return null;

  // The chart's own labels decide; page text only when the chart says nothing.
  const unit = detectUnit(decode(chartHtml)) ?? detectUnit(pageText);
  if (!unit) return null;

  let hasRanges = false;
  const sizeRows: SizeRow[] = [];
  for (const cells of rows.slice(1)) {
    const label = cells[0]?.trim();
    if (!label) continue;
    const row: SizeRow = { label };
    dims.forEach((dim, i) => {
      if (!dim) return;
      const value = parseValue(cells[i] ?? '');
      if (value === null) return;
      if (Array.isArray(value)) hasRanges = true;
      row[dim] = value;
    });
    if (Object.keys(row).length > 1) sizeRows.push(row);
  }

  const parsed = RawSizeChartSchema.safeParse({ unit, rows: sizeRows });
  if (!parsed.success) return null;
  const context = `${decode(chartHtml)} ${pageText}`;
  const chartType = detectChartType(context, hasRanges);
  return { chart: parsed.data, chartType, measurementBasis: detectBasis(context, chartType) };
}
