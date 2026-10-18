import { trackForCategory } from './categorize';
import { knockOutStudioBackground } from './cutout';
import { parsePageProduct, type PageProduct, type PageSnapshot } from './parse-product';
import type { GarmentCategory, WornGarment } from './types';

export type { PageProduct };

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

  return {
    url: location.href,
    title: document.title,
    jsonLdTexts,
    metas,
    images,
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

/** JPEG (or fetched) product photo suitable to send as garment_image. */
export async function captureProductImage(url: string | null): Promise<string | null> {
  if (!url) return null;
  return toDataUrl(url);
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
