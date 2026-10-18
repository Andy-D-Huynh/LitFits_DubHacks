export type GarmentSizeChoice = {
  /** Size label as the product page shows it, e.g. "M" or "32". */
  size: string;
  /** Sizes offered on that page. Ordered smallest to largest when the labels allow it. */
  offered: string[];
};

const LETTER_RANK: Record<string, number> = {
  xxxs: 0,
  'xxx-small': 0,
  '3xs': 0,
  xxs: 1,
  'xx-small': 1,
  '2xs': 1,
  xs: 2,
  'x-small': 2,
  'extra small': 2,
  'extra-small': 2,
  s: 3,
  small: 3,
  m: 4,
  medium: 4,
  l: 5,
  large: 5,
  xl: 6,
  'x-large': 6,
  'extra large': 6,
  'extra-large': 6,
  xxl: 7,
  '2xl': 7,
  'xx-large': 7,
  'extra extra large': 7,
  xxxl: 8,
  '3xl': 8,
  'xxx-large': 8,
  xxxxl: 9,
  '4xl': 9,
  '5xl': 10,
  '6xl': 11,
};

function letterRank(label: string): number | null {
  const key = label.toLowerCase().replace(/\s+/g, ' ').trim();
  if (Object.prototype.hasOwnProperty.call(LETTER_RANK, key)) {
    return LETTER_RANK[key] ?? null;
  }
  const parts = key.split(/\s*\/\s*/);
  if (parts.length < 2) return null;
  const ranks: number[] = [];
  for (const part of parts) {
    if (!Object.prototype.hasOwnProperty.call(LETTER_RANK, part)) return null;
    const rank = LETTER_RANK[part];
    if (rank == null) return null;
    ranks.push(rank);
  }
  return Math.min(...ranks);
}

function looksLikeSize(text: string, inSizeControl: boolean): boolean {
  const t = text.trim();
  if (letterRank(t) != null) return true;
  if (/^(one size|onesize|os|osfa|free size)$/i.test(t)) return true;
  if (/^\d{2}\s*[x×/]\s*\d{2}$/i.test(t)) return true;
  if (/^w\s*\d{2}(\s*[x×/]\s*l\s*\d{2})?$/i.test(t)) return true;

  const prefixed = t.match(/^(?:eu|us|uk)\s*(\d{1,2}(?:\.\d)?)$/i);
  if (prefixed?.[1]) {
    const n = Number(prefixed[1]);
    return Number.isFinite(n) && n >= 0 && n <= 70;
  }

  if (!/^\d{1,2}(?:\.\d)?$/.test(t)) return false;
  const n = Number(t);
  if (!Number.isFinite(n)) return false;
  if (t.includes('.')) return n >= 3 && n <= 20;
  if (!inSizeControl) return n >= 24 && n <= 70;
  return n >= 0 && n <= 70;
}

/** Turn a raw control label into a size, or null when it is not a size. */
export function cleanSizeLabel(raw: string, inSizeControl = false): string | null {
  let text = raw.replace(/\s+/g, ' ').trim();
  if (!text || text.length > 48) return null;
  text = text.replace(/^(?:size|taille|größe|grosse|talla)\s*[:：.\-]?\s*/i, '').trim();
  text = text.replace(
    /\s*\((?:out of stock|sold out|low stock|unavailable|in stock|notify me[^)]*)\)\s*$/i,
    '',
  );
  text = text.replace(/\s*[-–—]\s*(?:in stock|out of stock|sold out|low stock|unavailable)\s*$/i, '');
  text = text.trim();
  if (!text || text.length > 24) return null;
  if (/guide|chart|find your|select|choose|pick\b|notify/i.test(text)) return null;

  const wrapped = text.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (wrapped?.[1] && wrapped[2]) {
    const outer = wrapped[1].trim();
    const inner = wrapped[2].trim();
    if (looksLikeSize(outer, inSizeControl)) return outer;
    if (looksLikeSize(inner, inSizeControl)) return inner;
    return null;
  }
  if (!looksLikeSize(text, inSizeControl)) return null;
  return text;
}

type SortKey = { kind: 'letter' | 'number'; value: number };

function sortKey(label: string): SortKey | null {
  const letter = letterRank(label);
  if (letter != null) return { kind: 'letter', value: letter };
  const key = label.toLowerCase().trim();
  const match = key.match(/(\d+(?:\.\d+)?)/);
  const digits = match?.[1];
  if (!digits) return null;
  if (!/^(?:\d|eu\b|us\b|uk\b|w\b)/.test(key)) return null;
  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  return { kind: 'number', value };
}

/** Dedupe labels. Sort smallest to largest when every label is the same kind of size. */
export function orderSizeLabels(labels: string[]): string[] {
  const unique: string[] = [];
  for (const label of labels) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    if (unique.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) continue;
    unique.push(trimmed);
  }

  let kind: SortKey['kind'] | null = null;
  const ranked: Array<{ label: string; value: number; index: number }> = [];
  for (let index = 0; index < unique.length; index += 1) {
    const label = unique[index];
    if (!label) return unique;
    const key = sortKey(label);
    if (!key) return unique;
    if (kind && key.kind !== kind) return unique;
    kind = key.kind;
    ranked.push({ label, value: key.value, index });
  }

  ranked.sort((a, b) => a.value - b.value || a.index - b.index);
  return ranked.map((item) => item.label);
}

export function resolveSizeList(
  found: Array<{ label: string; selected?: boolean }>,
): { sizes: string[]; selected: string | null } {
  const cleaned: Array<{ label: string; selected: boolean }> = [];
  for (const item of found) {
    const label = cleanSizeLabel(item.label, true);
    if (!label) continue;
    const existing = cleaned.find((entry) => entry.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      if (item.selected) existing.selected = true;
      continue;
    }
    cleaned.push({ label, selected: Boolean(item.selected) });
  }

  const sizes = orderSizeLabels(cleaned.map((entry) => entry.label));
  const picked = cleaned.find((entry) => entry.selected);
  const selected = picked
    ? (sizes.find((size) => size.toLowerCase() === picked.label.toLowerCase()) ?? null)
    : null;
  return { sizes, selected };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function addSizeValue(value: unknown, out: string[]) {
  if (typeof value === 'string') {
    const clean = cleanSizeLabel(value, true);
    if (clean && !out.some((size) => size.toLowerCase() === clean.toLowerCase())) out.push(clean);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) addSizeValue(item, out);
    return;
  }
  const obj = asRecord(value);
  if (!obj) return;
  if (typeof obj.name === 'string') addSizeValue(obj.name, out);
  else if (typeof obj.value === 'string') addSizeValue(obj.value, out);
}

function walkJsonLd(value: unknown, out: string[]) {
  if (Array.isArray(value)) {
    for (const item of value) walkJsonLd(item, out);
    return;
  }
  const obj = asRecord(value);
  if (!obj) return;
  if ('size' in obj) addSizeValue(obj.size, out);
  if (Array.isArray(obj['@graph'])) walkJsonLd(obj['@graph'], out);
  if (obj.offers) walkJsonLd(obj.offers, out);
  if (obj.hasVariant) walkJsonLd(obj.hasVariant, out);
}

/** Sizes declared on a product's JSON-LD, smallest to largest when possible. */
export function sizesFromJsonLd(texts: string[]): string[] {
  const found: string[] = [];
  for (const text of texts) {
    try {
      walkJsonLd(JSON.parse(text) as unknown, found);
    } catch {
      // Retail pages sometimes ship invalid JSON-LD.
    }
  }
  return orderSizeLabels(found);
}

function hangFor(size: string, index: number, last: number): string {
  if (last <= 0) {
    return `Size ${size} is the only size offered. Wear it with the ease and length shown in the product photo, on this unchanged body.`;
  }
  if (index <= 0) {
    return `Size ${size} is the smallest size in this run. On this unchanged body the garment should look small: close to the skin, little ease, and a shorter hem and sleeves than the larger sizes. Do not shrink the person to make the small size fit.`;
  }
  if (index >= last) {
    return `Size ${size} is the largest size in this run. On this unchanged body the garment should look large: generous ease, more volume, a longer hem and sleeves, and fabric hanging away from the body. Do not enlarge the person to fill the garment.`;
  }
  const t = index / last;
  if (t < 0.45) {
    return `Size ${size} is a smaller size in this run. On this unchanged body the garment should sit closer than a middle size, with less ease and a slightly shorter hem and sleeves. Do not change the person's body.`;
  }
  if (t > 0.55) {
    return `Size ${size} is a larger size in this run. On this unchanged body the garment should have more ease, a longer hem and sleeves, and fabric that hangs slightly away from the body. Do not enlarge the person.`;
  }
  return `Size ${size} is a middle size in this run. On this unchanged body the garment should sit with its intended ease: natural, neither pulled tight nor hanging with extra volume.`;
}

/**
 * How the chosen page size should look. The person's proportions stay fixed;
 * only the new garment's ease and length change.
 */
export function garmentSizeDirective(
  targetGarment: string,
  choice: GarmentSizeChoice | null | undefined,
): string {
  const body =
    "BODY PROPORTION REQUIREMENT: Keep the person's exact body proportions from the first image. Do not change their height, shoulder width, chest, waist, hips, limb length, pose, or build. Do not make the person larger, smaller, taller, or shorter. Only the newly added garment may change.";

  const size = choice?.size.trim() ?? '';
  if (!size) {
    return `${body} SIZE SPECIFICATION: Wear ${targetGarment} as shown in the product photo, on this unchanged body. Clothes already on the person stay as they are.`;
  }

  const offered = (choice?.offered ?? []).map((label) => label.trim()).filter(Boolean);
  const includesSize = offered.some((label) => label.toLowerCase() === size.toLowerCase());
  const list = orderSizeLabels(includesSize ? offered : [...offered, size]);
  const index = list.findIndex((label) => label.toLowerCase() === size.toLowerCase());
  const place = index < 0 ? 0 : index;
  const hang = hangFor(size, place, list.length - 1);
  return `${body} SIZE SPECIFICATION: Dress the person in size "${size}" of ${targetGarment}. The store lists these sizes from smallest to largest: ${list.join(', ')}. ${hang} Clothes already on the person stay as they are.`;
}
