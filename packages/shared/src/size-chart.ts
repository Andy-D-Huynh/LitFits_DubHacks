import type { z } from 'zod';
import { RawSizeChartSchema, type FitDirectRequestSchema } from './schemas';
import type {
  Category,
  ChartType,
  Dim,
  DimValue,
  FitType,
  LengthUnit,
  MeasurementBasis,
  RawSizeChart,
  SizeRow,
  Stretch,
} from './types';

// Deterministic size-chart table parser for the DOM extraction path (no LLM).
// Returns null rather than guessing when the unit or layout is unclear.
// Plain string parsing, no DOM, so the server (ingest) and the extension's
// content script share it.

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

// A whole page or a modal can hold several tables; the first one that parses
// as a size chart wins. The text just before a table (usually its heading,
// e.g. "Size guide (inches)") is tried first for the unit, then pageText.
export function findSizeChart(html: string, pageText = ''): ParsedChart | null {
  for (const match of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const before = decode(html.slice(Math.max(0, match.index - 600), match.index)).slice(-200);
    const parsed = parseSizeChart(match[0], before) ?? parseSizeChart(match[0], pageText);
    if (parsed) return parsed;
  }
  return null;
}

export function classifyFit(text: string): FitType | null {
  if (/\b(relaxed|oversized|loose|boxy|baggy|wide[- ]leg)\b/i.test(text)) return 'relaxed';
  if (/\b(slim|skinny|fitted|tailored|muscle fit)\b/i.test(text)) return 'slim';
  if (/\b(regular|classic|straight|standard) fit\b/i.test(text)) return 'regular';
  return null;
}

// From fabric composition: ≥5% elastane/spandex is high stretch, any is low.
export function classifyStretch(text: string): Stretch {
  const m = /(\d{1,2})\s*%\s*(elastane|spandex|lycra)/i.exec(text);
  if (m) return Number(m[1]) >= 5 ? 'high' : 'low';
  if (/\b(elastane|spandex|lycra|stretch)\b/i.test(text)) return 'low';
  return 'none';
}

export type FitDirectGarment = z.output<typeof FitDirectRequestSchema>['garment'];

const FIT_CATEGORIES: readonly string[] = ['top', 'bottom', 'outerwear', 'dress'];

/**
 * The `garment` part of a POST /api/fit/direct body, built from a product page:
 * its tables' HTML plus descriptive text (name, description, size-guide
 * headings; used for fit type, stretch and the chart's unit). Null when no
 * table parses as a size chart or the category has no fit rules.
 */
export function fitGarmentFromPage(page: {
  sourceUrl?: string;
  category: string;
  tablesHtml: string;
  text: string;
}): FitDirectGarment | null {
  if (!FIT_CATEGORIES.includes(page.category)) return null;
  const parsed = findSizeChart(page.tablesHtml, page.text);
  if (!parsed) return null;
  return {
    ...(page.sourceUrl ? { sourceUrl: page.sourceUrl } : {}),
    category: page.category as Category,
    fitType: classifyFit(page.text),
    stretch: classifyStretch(page.text),
    chartType: parsed.chartType,
    measurementBasis: parsed.measurementBasis,
    sizeChart: parsed.chart,
    extractionMethod: 'dom',
  };
}
