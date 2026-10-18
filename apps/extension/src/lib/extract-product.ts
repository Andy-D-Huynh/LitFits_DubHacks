import { trackForCategory } from './categorize';
import { knockOutStudioBackground } from './cutout';
import { parsePageProduct, type PageProduct, type PageSnapshot } from './parse-product';
import type { GarmentCategory, WornGarment } from './types';

export type { PageProduct };

function findActiveColorName(): string | null {
  // 1. Swatch and selector attributes
  const swatchSelectors = [
    '[data-testid*="color" i] [class*="selected" i]',
    '[data-testid*="color" i] [aria-checked="true"]',
    '[class*="color" i] [class*="selected" i]',
    '[class*="color" i] [class*="active" i]',
    '[class*="swatch" i][class*="selected" i]',
    '[class*="swatch" i][class*="active" i]',
    'button[aria-label*="color" i][aria-checked="true"]',
    'button[aria-label*="colour" i][aria-checked="true"]',
    'input[name*="color" i]:checked + label',
    'input[name*="colour" i]:checked + label',
    '.selected-color',
    '.active-color',
    '[data-selected-color]',
  ];

  for (const sel of swatchSelectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) {
      const val =
        el.getAttribute('data-color') ||
        el.getAttribute('data-selected-color') ||
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.innerText ||
        el.textContent;
      if (val && val.trim().length >= 2 && val.trim().length <= 40) {
        return val.replace(/^(color|colour)\s*[:：]\s*/i, '').trim();
      }
    }
  }

  // 2. Visible "Color: Red" labels on the page
  const textElements = Array.from(document.querySelectorAll<HTMLElement>('p, span, div, h2, h3, label'));
  for (const el of textElements) {
    if (el.children.length > 2) continue;
    const txt = (el.innerText || el.textContent || '').trim();
    const match = txt.match(/^(?:color|colour)\s*[:：]\s*([a-zA-Z0-9\s/-]{2,30})$/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function findActiveProductImage(): string | null {
  const skipPattern = /(sprite|icon|logo|pixel|avatar|badge|placeholder)/i;

  // 1. Look for active slide / main image in product galleries
  const activeSelectors = [
    // Swiper / Slick / standard slider active classes
    '.swiper-slide-active img',
    '.swiper-slide-duplicate-active img',
    '.slick-current img',
    '.slick-active img',
    '[aria-roledescription="slide"][aria-hidden="false"] img',
    '[data-testid*="active-slide"] img',
    // Main gallery viewers
    '[data-testid*="main-image"] img',
    '[data-testid*="hero-image"] img',
    '[data-testid*="product-image"] img',
    '.product__media img',
    '.gallery__main img',
    '.product-single__photo img',
    '.product-main-slide img',
    '.media-gallery__viewer img',
    '#main-product-image',
    'img[data-main-image]',
    'img[data-zoom-image]',
  ];

  for (const sel of activeSelectors) {
    const el = document.querySelector<HTMLImageElement>(sel);
    const src = el?.currentSrc || el?.src;
    if (src && !src.startsWith('data:') && !skipPattern.test(src)) {
      const rect = el.getBoundingClientRect();
      if (rect.width >= 120 && rect.height >= 120) {
        return src;
      }
    }
  }

  // 2. Fallback: Find the largest visible image in the product presentation area
  const allImgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
  let bestSrc: string | null = null;
  let bestScore = 0;

  for (const img of allImgs) {
    if (img.closest('#fitmirror-avatar-root') || img.id === 'fitmirror-tryon-badge') continue;
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith('data:') || skipPattern.test(src) || skipPattern.test(img.alt)) continue;

    const rect = img.getBoundingClientRect();
    if (rect.width < 140 || rect.height < 140) continue;
    // Product main photos are typically in top 1200px of page and visible
    if (rect.bottom <= 0 || rect.top >= Math.max(window.innerHeight * 1.5, 1200)) continue;
    if (rect.right <= 0 || rect.left >= window.innerWidth) continue;

    const area = rect.width * rect.height;
    // Score based on area and proximity to top
    const score = area / (1 + Math.max(0, rect.top));
    if (score > bestScore) {
      bestScore = score;
      bestSrc = src;
    }
  }

  return bestSrc;
}

function snapshotFromDocument(): PageSnapshot {
  const jsonLdTexts: string[] = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    const text = script.textContent?.trim();
    if (text) jsonLdTexts.push(text);
  }

  const metas = [...document.querySelectorAll('meta')].flatMap((el) => {
    const content = el.getAttribute('content');
    if (!content) return [];
    return [
      {
        property: el.getAttribute('property') ?? undefined,
        name: el.getAttribute('name') ?? undefined,
        content,
      },
    ];
  });

  const images = [...document.querySelectorAll('img')].map((img) => ({
    src: img.currentSrc || img.src,
    alt: img.alt || '',
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
  }));

  const activeImageUrl = findActiveProductImage();
  const activeColor = findActiveColorName();

  return {
    url: location.href,
    title: document.title,
    jsonLdTexts,
    metas,
    images,
    activeImageUrl,
    activeColor,
  };
}

/** Read the product on the retail page the user is actually viewing. */
export function extractProductFromPage(): PageProduct {
  return parsePageProduct(snapshotFromDocument());
}

async function fetchViaBackground(url: string): Promise<string | null> {
  try {
    const res = (await chrome.runtime.sendMessage({
      type: 'fitmirror:fetch-image',
      url,
    })) as { ok?: boolean; dataUrl?: string } | undefined;
    return res?.ok && res.dataUrl ? res.dataUrl : null;
  } catch {
    return null;
  }
}

async function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

async function toDataUrl(url: string): Promise<string | null> {
  const imgEl = [...document.querySelectorAll('img')].find((img) => {
    const src = img.currentSrc || img.src;
    return src === url || src.includes(url);
  });
  if (imgEl && imgEl.naturalWidth > 0) {
    const canvas = document.createElement('canvas');
    const max = 900;
    const scale = Math.min(1, max / Math.max(imgEl.naturalWidth, imgEl.naturalHeight));
    canvas.width = Math.max(1, Math.round(imgEl.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(imgEl.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
        try {
          return canvas.toDataURL('image/jpeg', 0.86);
        } catch {
        // Tainted canvas — fall through to a network fetch.
      }
    }
  }

  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.type.startsWith('image/') && blob.size <= 2_500_000) {
        const fromPage = await blobToDataUrl(blob);
        if (fromPage) return fromPage;
      }
    }
  } catch {
    // Background fetch uses the extension's host permission.
  }

  return fetchViaBackground(url);
}

function cutoutFromDataUrl(dataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { raster, removed } = knockOutStudioBackground({
        width: canvas.width,
        height: canvas.height,
        rgba: image.data,
      });
      if (!removed) {
        resolve(null);
        return;
      }
      image.data.set(raster.rgba);
      ctx.putImageData(image, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/** Web URL or data URI suitable to send as garment_image to the try-on API. */
export async function captureProductImage(url: string | null): Promise<string | null> {
  if (!url) return null;
  // If already an absolute http(s) URL, use it directly (fast, no canvas taint, no CORS failure)
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  if (url.startsWith('data:')) {
    return url;
  }
  try {
    const full = new URL(url, location.href).href;
    if (/^https?:\/\//i.test(full)) return full;
  } catch {}

  // Fallback to toDataUrl with a 3s timeout so it never hangs
  return Promise.race([
    toDataUrl(url),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
  ]);
}

export async function buildWornGarment(
  extracted: PageProduct,
  category: GarmentCategory,
): Promise<WornGarment> {
  const imageDataUrl = extracted.imageUrl ? await toDataUrl(extracted.imageUrl) : null;
  const cutoutDataUrl = imageDataUrl ? await cutoutFromDataUrl(imageDataUrl) : null;
  return {
    id: crypto.randomUUID(),
    name: extracted.name,
    category,
    track: trackForCategory(category),
    primaryColor: extracted.color,
    primaryImageUrl: extracted.imageUrl,
    imageDataUrl,
    cutoutDataUrl,
    brand: extracted.brand,
    sourceUrl: extracted.sourceUrl,
    retailer: extracted.retailer,
    price: extracted.price,
    addedAt: new Date().toISOString(),
  };
}
