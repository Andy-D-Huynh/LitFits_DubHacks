import { guessCategory, retailerFromUrl } from './categorize';
import type { GarmentCategory, ProductPrice } from './types';

export type PageImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

export type PageMeta = {
  property?: string;
  name?: string;
  content: string;
};

/** What the content script can see on a retail page. Parsing itself is pure. */
export type PageSnapshot = {
  url: string;
  title: string;
  jsonLdTexts: string[];
  metas: PageMeta[];
  images: PageImage[];
};

export type PageProduct = {
  name: string;
  brand: string | null;
  imageUrl: string | null;
  category: GarmentCategory;
  sourceUrl: string;
  retailer: string | null;
  price: ProductPrice | null;
  color: string | null;
};

const SKIP_IMAGE = /(sprite|icon|logo|pixel|avatar|badge|placeholder)/i;

function metaContent(metas: PageMeta[], key: string): string | null {
  const found = metas.find((m) => m.property === key || m.name === key);
  const value = found?.content.trim();
  return value || null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function collectProducts(value: unknown, out: Array<Record<string, unknown>>) {
  if (Array.isArray(value)) {
    for (const item of value) collectProducts(item, out);
    return;
  }
  const obj = asRecord(value);
  if (!obj) return;
  if (Array.isArray(obj['@graph'])) collectProducts(obj['@graph'], out);
  const type = obj['@type'];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => String(t).toLowerCase() === 'product')) out.push(obj);
}

function productsFromJsonLd(texts: string[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const text of texts) {
    try {
      collectProducts(JSON.parse(text) as unknown, out);
    } catch {
      // Retail pages sometimes ship invalid JSON-LD. Skip that block.
    }
  }
  return out;
}

function firstImageUrl(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstImageUrl(item);
      if (found) return found;
    }
  }
  const obj = asRecord(value);
  if (obj && 'url' in obj) return firstImageUrl(obj.url);
  return null;
}

function brandName(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  const obj = asRecord(value);
  if (obj && typeof obj.name === 'string' && obj.name.trim()) return obj.name.trim();
  return null;
}

function readPrice(offers: unknown): ProductPrice | null {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const offer of list) {
    const obj = asRecord(offer);
    if (!obj) continue;
    const raw = obj.price ?? obj.lowPrice;
    const amount = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    const currency = typeof obj.priceCurrency === 'string' ? obj.priceCurrency.trim() : '';
    if (!currency || !Number.isFinite(amount) || amount < 0) continue;
    return { amount, currency };
  }
  return null;
}

function largestUsefulImage(images: PageImage[]): string | null {
  let best: PageImage | null = null;
  let bestArea = 0;
  for (const image of images) {
    if (!image.src || image.src.startsWith('data:')) continue;
    if (SKIP_IMAGE.test(image.src) || SKIP_IMAGE.test(image.alt)) continue;
    const area = Math.max(0, image.width) * Math.max(0, image.height);
    if (area < 80 * 80) continue;
    if (!best || area > bestArea) {
      best = image;
      bestArea = area;
    }
  }
  return best?.src ?? null;
}

/**
 * Read a clothing product from a live page snapshot.
 * Missing fields stay null. Nothing here is filled in from a catalog.
 */
export function parsePageProduct(snapshot: PageSnapshot): PageProduct {
  const product = productsFromJsonLd(snapshot.jsonLdTexts)[0];
  const name =
    (typeof product?.name === 'string' && product.name.trim()) ||
    metaContent(snapshot.metas, 'og:title') ||
    metaContent(snapshot.metas, 'twitter:title') ||
    snapshot.title.trim() ||
    'Product';

  const brand =
    brandName(product?.brand) ||
    metaContent(snapshot.metas, 'product:brand') ||
    metaContent(snapshot.metas, 'og:site_name');

  const imageUrl =
    firstImageUrl(product?.image) ||
    metaContent(snapshot.metas, 'og:image') ||
    metaContent(snapshot.metas, 'twitter:image') ||
    largestUsefulImage(snapshot.images);

  const description =
    (typeof product?.description === 'string' && product.description) ||
    metaContent(snapshot.metas, 'og:description') ||
    '';

  const color = typeof product?.color === 'string' && product.color.trim() ? product.color.trim() : null;

  return {
    name: name.slice(0, 160),
    brand: brand?.slice(0, 80) ?? null,
    imageUrl,
    category: guessCategory(`${name} ${description}`),
    sourceUrl: snapshot.url,
    retailer: retailerFromUrl(snapshot.url),
    price: product ? readPrice(product.offers) : null,
    color: color?.slice(0, 40) ?? null,
  };
}
