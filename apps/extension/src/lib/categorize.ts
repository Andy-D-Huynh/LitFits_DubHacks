import type { GarmentCategory, GarmentTrack } from './types';

const RE_BOTTOM =
  /\b(pant|pants|trouser|trousers|jean|jeans|denim|chino|chinos|short|shorts|skirt|skirts|jogger|joggers|legging|leggings|cargo|cargos|slacks|sweatpants|sweatpant|tights|bermuda|capri|bottom|bottoms)\b/i;

const RE_DRESS = /\b(dress|dresses|gown|gowns|jumpsuit|jumpsuits|romper|rompers|overall|overalls|bodysuit)\b/i;

const RE_FOOTWEAR =
  /\b(shoe|shoes|sneaker|sneakers|boot|boots|sandal|sandals|heel|heels|loafer|loafers|footwear|slide|slides|mule|mules|clog|clogs|sock|socks)\b/i;

const RE_ACCESSORY =
  /\b(hat|cap|beanie|bag|handbag|tote|backpack|belt|scarf|sunglasses|eyewear|jewelry|earring|earrings|necklace|bracelet|ring|watch)\b/i;

const RE_OUTERWEAR =
  /\b(coat|coats|jacket|jackets|blazer|blazers|parka|parkas|puffer|bomber|trench|windbreaker|anorak|cardigan|cardigans|overcoat|hoodie|hoodies)\b/i;

const RE_TOP =
  /\b(shirt|shirts|tee|tees|t-shirt|t-shirts|top|tops|blouse|blouses|sweater|sweaters|sweatshirt|sweatshirts|tank|camisole|polo|vest)\b/i;

export function guessCategory(
  nameOrText: string,
  url?: string,
  description?: string,
): GarmentCategory {
  // 1. Match against product name first (highest priority)
  const name = nameOrText.trim();
  if (RE_BOTTOM.test(name)) return 'bottom';
  if (RE_DRESS.test(name)) return 'dress';
  if (RE_OUTERWEAR.test(name)) return 'outerwear';
  if (RE_TOP.test(name)) return 'top';
  if (RE_FOOTWEAR.test(name)) return 'footwear';
  if (RE_ACCESSORY.test(name)) return 'accessory';

  // 2. Match against URL path (e.g. /pants/, /bottoms/, /jeans/)
  if (url) {
    const u = url.toLowerCase();
    if (RE_BOTTOM.test(u)) return 'bottom';
    if (RE_DRESS.test(u)) return 'dress';
    if (RE_OUTERWEAR.test(u)) return 'outerwear';
    if (RE_TOP.test(u)) return 'top';
    if (RE_FOOTWEAR.test(u)) return 'footwear';
    if (RE_ACCESSORY.test(u)) return 'accessory';
  }

  // 3. Fallback to description, removing styling phrases like "styled with..."
  if (description) {
    const cleanDesc = description
      .replace(/styled with[^.]+[\.]?/gi, '')
      .replace(/pair with[^.]+[\.]?/gi, '')
      .replace(/model (is )?wearing[^.]+[\.]?/gi, '');

    if (RE_BOTTOM.test(cleanDesc)) return 'bottom';
    if (RE_DRESS.test(cleanDesc)) return 'dress';
    if (RE_OUTERWEAR.test(cleanDesc)) return 'outerwear';
    if (RE_TOP.test(cleanDesc)) return 'top';
    if (RE_FOOTWEAR.test(cleanDesc)) return 'footwear';
    if (RE_ACCESSORY.test(cleanDesc)) return 'accessory';
  }

  // Default fallback
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
