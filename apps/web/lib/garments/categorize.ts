import type { GarmentCategory } from '@/lib/opencv/types';

/** Guess slot from product title / description for any retailer. */
export function guessCategory(text: string): GarmentCategory {
  const t = text.toLowerCase();

  if (
    /\b(dress|gown|jumpsuit|romper|overall)\b/.test(t)
  ) {
    return 'dress';
  }
  if (
    /\b(puffer|down jacket|parka|coat|blazer|bomber|hoodie|zip[- ]?up|cardigan|anorak|trench|windbreaker|outerwear|jacket)\b/.test(
      t,
    )
  ) {
    return 'outerwear';
  }
  if (
    /\b(jean|denim|chino|trouser|pant|short|skirt|jogger|legging|cargo|bottom)\b/.test(t)
  ) {
    return 'bottom';
  }
  return 'top';
}

export function retailerFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.split('.')[0] || host;
  } catch {
    return null;
  }
}
