import {
  classifyFit,
  classifyStretch,
  parseSizeChart,
  type Category,
  type IngestRequest,
} from '@fitmirror/shared';
import type { GarmentNormalizer, NormalizedGarment } from './types';

// Deterministic normalizer: JSON-LD Product fields, keyword classification and
// the table parser. No network, so it is the default and the demo path.

// Extraction confidence (docs/ingestion-extension.md): DOM with a valid chart 0.9.
export const DOM_CONFIDENCE_WITH_CHART = 0.9;
export const DOM_CONFIDENCE_WITHOUT_CHART = 0.5;

type JsonObject = Record<string, unknown>;

function isObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Finds the first @type Product node, including inside arrays and @graph.
export function findProduct(jsonld: unknown): JsonObject | null {
  const stack: unknown[] = [jsonld];
  while (stack.length > 0) {
    const node = stack.shift();
    if (Array.isArray(node)) stack.push(...node);
    else if (isObject(node)) {
      const type = node['@type'];
      if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) return node;
      if (node['@graph']) stack.push(node['@graph']);
    }
  }
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (isObject(v) && typeof v.name === 'string') return v.name.trim() || null;
  return null;
}

function images(v: unknown): string[] {
  const list = Array.isArray(v) ? v : [v];
  return list
    .map((i) => (typeof i === 'string' ? i : isObject(i) ? (i.url ?? i.contentUrl) : null))
    .filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u));
}

function offer(product: JsonObject): JsonObject | null {
  const o = product.offers;
  if (Array.isArray(o)) return o.find(isObject) ?? null;
  return isObject(o) ? o : null;
}

const CATEGORY_WORDS: [Category | 'unsupported', RegExp][] = [
  [
    'unsupported',
    /\b(shoes?|sneakers?|boots?|sandals?|heels|socks?|hats?|caps?|bags?|belts?|scarf|scarves|sunglasses|jewel(le)?ry)\b/i,
  ],
  ['dress', /\b(dress|dresses|jumpsuit|romper|gown)\b/i],
  [
    'outerwear',
    /\b(jackets?|\w*coats?|parkas?|blazers?|anoraks?|puffers?|overshirts?|trench|gilets?|vests?)\b/i,
  ],
  [
    'bottom',
    /\b(jeans?|pants?|trousers?|chinos?|joggers?|shorts|leggings|skirts?|sweatpants|cargos?)\b/i,
  ],
  [
    'top',
    /\b(t-?shirts?|tees?|shirts?|blouses?|sweaters?|jumpers?|hoodies?|sweatshirts?|tops?|polos?|tanks?|cardigans?|knit)\b/i,
  ],
];

export function classifyCategory(text: string): Category | 'unsupported' | null {
  for (const [category, re] of CATEGORY_WORDS) if (re.test(text)) return category;
  return null;
}

export class MockNormalizer implements GarmentNormalizer {
  readonly name = 'mock';

  async normalize(input: IngestRequest): Promise<NormalizedGarment> {
    const product = findProduct(input.jsonld) ?? {};
    const o = offer(product);
    const name = str(product.name) ?? input.title?.trim() ?? null;
    const text = [name, str(product.description), input.pageText].filter(Boolean).join(' ');
    const price = Number(o?.price);
    const imageUrls = [...new Set([...images(product.image), ...input.imageUrls])].slice(0, 8);
    const parsed = input.chartHtml ? parseSizeChart(input.chartHtml, input.pageText ?? '') : null;

    return {
      name,
      brand: str(product.brand),
      category:
        classifyCategory(`${name ?? ''} ${str(product.category) ?? ''}`) ??
        classifyCategory(text) ??
        'unsupported',
      fitType: classifyFit(text),
      stretch: classifyStretch(text),
      primaryColor: str(product.color),
      priceCents: Number.isFinite(price) && price >= 0 ? Math.round(price * 100) : null,
      currency: str(o?.priceCurrency)?.toUpperCase().slice(0, 3) ?? null,
      chartType: parsed?.chartType ?? null,
      measurementBasis: parsed?.measurementBasis ?? null,
      sizeChart: parsed?.chart ?? null,
      primaryImageUrl: imageUrls[0] ?? null,
      imageUrls,
      extractionMethod: 'dom',
      extractionConfidence: parsed ? DOM_CONFIDENCE_WITH_CHART : DOM_CONFIDENCE_WITHOUT_CHART,
    };
  }
}
