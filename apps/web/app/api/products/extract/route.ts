import { fitGarmentFromPage } from '@fitmirror/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guessCategory, retailerFromUrl } from '@/lib/garments/categorize';
import { fetchImageDataUrl } from '@/lib/garments/fetch-image-data-url';

const BodySchema = z.object({
  url: z.string().url(),
});

function absUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function metaContent(html: string, ...keys: string[]): string | null {
  for (const key of keys) {
    const prop = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
      'i',
    );
    const prop2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
      'i',
    );
    const m = html.match(prop) ?? html.match(prop2);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function jsonLdProducts(html: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    try {
      const data = JSON.parse(match[1]!) as unknown;
      const stack = Array.isArray(data) ? data : [data];
      for (const item of stack) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        const type = obj['@type'];
        const types = Array.isArray(type) ? type : [type];
        if (types.some((t) => String(t).toLowerCase() === 'product')) out.push(obj);
        if (obj['@graph'] && Array.isArray(obj['@graph'])) {
          for (const g of obj['@graph']) {
            if (g && typeof g === 'object') {
              const gt = (g as Record<string, unknown>)['@type'];
              const gtypes = Array.isArray(gt) ? gt : [gt];
              if (gtypes.some((t) => String(t).toLowerCase() === 'product')) {
                out.push(g as Record<string, unknown>);
              }
            }
          }
        }
      }
    } catch {
      // skip bad JSON-LD
    }
  }
  return out;
}

function firstImage(value: unknown, pageUrl: string): string | null {
  if (typeof value === 'string') return absUrl(value, pageUrl);
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = firstImage(v, pageUrl);
      if (found) return found;
    }
  }
  if (value && typeof value === 'object' && 'url' in value) {
    return firstImage((value as { url: unknown }).url, pageUrl);
  }
  return null;
}

export async function POST(req: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(body.url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only http(s) URLs are allowed' }, { status: 400 });
  }

  let html: string;
  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; FitMirror/0.1; +https://fitmirror.local) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Could not fetch page (${res.status})` }, { status: 502 });
    }
    html = await res.text();
  } catch {
    return NextResponse.json({ error: 'Failed to fetch product page' }, { status: 502 });
  }

  const products = jsonLdProducts(html);
  const product = products[0];
  const name =
    (typeof product?.name === 'string' && product.name) ||
    metaContent(html, 'og:title', 'twitter:title') ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
    'Imported product';

  const brandRaw = product?.brand;
  const brand =
    typeof brandRaw === 'string'
      ? brandRaw
      : brandRaw && typeof brandRaw === 'object' && 'name' in brandRaw
        ? String((brandRaw as { name: unknown }).name)
        : metaContent(html, 'product:brand', 'og:site_name');

  const image =
    firstImage(product?.image, parsed.toString()) ||
    absUrl(metaContent(html, 'og:image', 'twitter:image') ?? '', parsed.toString());

  const description =
    (typeof product?.description === 'string' && product.description) ||
    metaContent(html, 'og:description', 'description') ||
    '';

  const category = guessCategory(`${name} ${description}`);
  const imageDataUrl = image ? await fetchImageDataUrl(image) : null;

  return NextResponse.json({
    name: name.slice(0, 160),
    brand: brand?.slice(0, 80) ?? null,
    imageUrl: image,
    imageDataUrl,
    category,
    sourceUrl: parsed.toString(),
    retailer: retailerFromUrl(parsed.toString()),
    // Size chart via the ingest parser, shaped as the `garment` for
    // POST /api/fit/direct. Null when the page's HTML has no parsable chart
    // (many stores load the size guide with JavaScript after the page).
    fitGarment: fitGarmentFromPage({
      sourceUrl: parsed.toString(),
      category,
      tablesHtml: html,
      text: `${name} ${description}`,
    }),
  });
}
