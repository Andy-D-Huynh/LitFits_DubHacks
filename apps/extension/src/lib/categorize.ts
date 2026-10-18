import type { GarmentCategory, GarmentTrack } from './types';

export function guessCategory(text: string): GarmentCategory {
  const t = text.toLowerCase();
  if (/\b(shoe|shoes|sneaker|boot|sandal|heel|loafer|footwear|sock|socks)\b/.test(t)) {
    return 'footwear';
  }
  if (/\b(hat|cap|beanie|bag|belt|scarf|sunglasses|jewelry|earring|necklace)\b/.test(t)) {
    return 'accessory';
  }
  if (/\b(dress|gown|jumpsuit|romper|overall)\b/.test(t)) return 'dress';
  if (
    /\b(puffer|down jacket|parka|coat|blazer|bomber|hoodie|zip[- ]?up|cardigan|anorak|trench|windbreaker|outerwear|jacket)\b/.test(
      t,
    )
  ) {
    return 'outerwear';
  }
  if (/\b(jean|denim|chino|trouser|pant|short|skirt|jogger|legging|cargo|bottom)\b/.test(t)) {
    return 'bottom';
  }
  return 'top';
}

export function trackForCategory(category: GarmentCategory): GarmentTrack {
  return category === 'footwear' || category === 'accessory' ? 'rigid' : 'soft';
}

export function retailerFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.split('.')[0] || host;
  } catch {
    return null;
  }
}
