import { trackForCategory } from './categorize';
import type {
  BrowsedProduct,
  FigurePersist,
  GarmentCategory,
  GeneratedLook,
  LikedGarment,
  OutfitSlots,
  SavedOutfit,
  SilhouetteResult,
  WornGarment,
} from './types';
import { STORAGE_KEY } from './types';

const emptySlots = (): OutfitSlots => ({
  top: null,
  bottom: null,
  outerwear: null,
  dress: null,
  footwear: null,
  accessory: null,
});

const CATEGORIES: GarmentCategory[] = [
  'top',
  'bottom',
  'outerwear',
  'dress',
  'footwear',
  'accessory',
];

function asGarment(value: unknown): WornGarment | null {
  if (!value || typeof value !== 'object') return null;
  const g = value as Partial<WornGarment>;
  if (typeof g.id !== 'string' || typeof g.name !== 'string') return null;
  const category = CATEGORIES.includes(g.category as GarmentCategory)
    ? (g.category as GarmentCategory)
    : 'top';
  return {
    id: g.id,
    name: g.name,
    category,
    track: g.track === 'rigid' || g.track === 'soft' ? g.track : trackForCategory(category),
    primaryColor: g.primaryColor ?? null,
    primaryImageUrl: g.primaryImageUrl ?? null,
    imageDataUrl: g.imageDataUrl ?? null,
    cutoutDataUrl: g.cutoutDataUrl ?? null,
    brand: g.brand ?? null,
    sourceUrl: g.sourceUrl ?? null,
    retailer: g.retailer ?? null,
    price: g.price ?? null,
    addedAt: typeof g.addedAt === 'string' ? g.addedAt : new Date().toISOString(),
  };
}

function normalizeSlots(value: unknown): OutfitSlots {
  const slots = (value && typeof value === 'object' ? value : {}) as Partial<
    Record<keyof OutfitSlots, unknown>
  >;
  return {
    top: asGarment(slots.top),
    bottom: asGarment(slots.bottom),
    outerwear: asGarment(slots.outerwear),
    dress: asGarment(slots.dress),
    footwear: asGarment(slots.footwear),
    accessory: asGarment(slots.accessory),
  };
}

const empty: FigurePersist = {
  silhouette: null,
  visible: false,
  slots: emptySlots(),
  closet: [],
  savedOutfits: [],
  modelImage: null,
  avatarImageUrl: null,
  avatarMinimized: false,
  liked: [],
  browsedProducts: [],
  lookHistory: [],
};

function asLiked(value: unknown): LikedGarment | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<LikedGarment>;
  if (typeof item.productUrl !== 'string' || typeof item.name !== 'string') return null;
  return {
    id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
    productUrl: item.productUrl,
    name: item.name,
    garmentImageUrl: typeof item.garmentImageUrl === 'string' ? item.garmentImageUrl : '',
    retailer: item.retailer ?? null,
    addedAt: typeof item.addedAt === 'string' ? item.addedAt : new Date().toISOString(),
    inCart: Boolean(item.inCart),
  };
}

function likedFrom(value: unknown): LikedGarment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const liked = asLiked(item);
    return liked ? [liked] : [];
  });
}

type Stored =
  | FigurePersist
  | {
      state?: FigurePersist;
      version?: number;
    };

function normalize(raw: unknown): FigurePersist {
  if (!raw || typeof raw !== 'object') return { ...empty, slots: emptySlots() };
  const obj = raw as Stored;
  if ('state' in obj && obj.state) {
    return {
      silhouette: obj.state.silhouette ?? null,
      visible: obj.state.visible ?? false,
      slots: normalizeSlots(obj.state.slots),
      closet: Array.isArray(obj.state.closet)
        ? obj.state.closet.flatMap((item) => {
            const garment = asGarment(item);
            return garment ? [garment] : [];
          })
        : [],
      savedOutfits: obj.state.savedOutfits ?? [],
      modelImage: obj.state.modelImage ?? null,
      avatarImageUrl: obj.state.avatarImageUrl ?? null,
      avatarMinimized: obj.state.avatarMinimized ?? false,
      liked: likedFrom(obj.state.liked),
      browsedProducts: Array.isArray(obj.state.browsedProducts) ? obj.state.browsedProducts : [],
      lookHistory: Array.isArray(obj.state.lookHistory) ? obj.state.lookHistory : [],
    };
  }
  const flat = obj as FigurePersist;
  return {
    silhouette: flat.silhouette ?? null,
    visible: flat.visible ?? false,
    slots: normalizeSlots(flat.slots),
    closet: Array.isArray(flat.closet)
      ? flat.closet.flatMap((item) => {
          const garment = asGarment(item);
          return garment ? [garment] : [];
        })
      : [],
    savedOutfits: flat.savedOutfits ?? [],
    modelImage: flat.modelImage ?? null,
    avatarImageUrl: flat.avatarImageUrl ?? null,
    avatarMinimized: flat.avatarMinimized ?? false,
    liked: likedFrom(flat.liked),
    browsedProducts: Array.isArray(flat.browsedProducts) ? flat.browsedProducts : [],
    lookHistory: Array.isArray(flat.lookHistory) ? flat.lookHistory : [],
  };
}

export async function loadFigure(): Promise<FigurePersist> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return normalize(result[STORAGE_KEY]);
}

export async function saveFigure(data: FigurePersist): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      state: data,
      version: 0,
    },
  });
}

function applyWear(slots: OutfitSlots, garment: WornGarment): OutfitSlots {
  const next = { ...slots };
  if (garment.category === 'dress') {
    next.dress = garment;
    next.top = null;
    next.bottom = null;
    return next;
  }
  if (garment.category === 'top') {
    next.top = garment;
    next.dress = null;
    return next;
  }
  if (garment.category === 'bottom') {
    next.bottom = garment;
    next.dress = null;
    return next;
  }
  if (garment.category === 'footwear') {
    next.footwear = garment;
    return next;
  }
  if (garment.category === 'accessory') {
    next.accessory = garment;
    return next;
  }
  next.outerwear = garment;
  return next;
}

function slotSourceUrls(slots: OutfitSlots): string[] {
  return [slots.dress, slots.top, slots.bottom, slots.outerwear, slots.footwear, slots.accessory]
    .filter(Boolean)
    .map((g) => g!.sourceUrl)
    .filter((u): u is string => Boolean(u));
}

export async function setSilhouette(silhouette: SilhouetteResult): Promise<FigurePersist> {
  const current = await loadFigure();
  const next: FigurePersist = { ...current, silhouette, visible: true };
  await saveFigure(next);
  return next;
}

/** Save the person's photo and clear the previous generated look. */
export async function setModelPhoto(
  modelImage: string,
  silhouette: SilhouetteResult | null,
): Promise<FigurePersist> {
  const current = await loadFigure();
  const next: FigurePersist = {
    ...current,
    modelImage,
    avatarImageUrl: null,
    avatarMinimized: false,
    visible: true,
    silhouette: silhouette ?? current.silhouette,
  };
  await saveFigure(next);
  return next;
}

export async function setAvatarMinimized(avatarMinimized: boolean): Promise<FigurePersist> {
  const current = await loadFigure();
  const next: FigurePersist = { ...current, avatarMinimized };
  await saveFigure(next);
  return next;
}

/** Replace the corner image, cache the generated look, and remember the product link for the cart. */
export async function applyTryOnResult(
  avatarImageUrl: string,
  liked: LikedGarment,
  category?: GarmentCategory,
): Promise<FigurePersist> {
  const current = await loadFigure();
  const without = current.liked.filter((item) => item.productUrl !== liked.productUrl);
  let slots = { ...current.slots };
  if (category && category in slots) {
    const worn: WornGarment = {
      id: liked.id,
      name: liked.name,
      category,
      track: trackForCategory(category),
      primaryColor: null,
      primaryImageUrl: liked.garmentImageUrl,
      imageDataUrl: null,
      cutoutDataUrl: null,
      brand: null,
      sourceUrl: liked.productUrl,
      retailer: liked.retailer,
      price: null,
      addedAt: liked.addedAt,
    };
    slots = applyWear(slots, worn);
  }

  // Cache generated look in lookHistory so the user can look back anytime even after remove
  const newLook: GeneratedLook = {
    id: crypto.randomUUID(),
    imageUrl: avatarImageUrl,
    garmentName: liked.name,
    garmentImageUrl: liked.garmentImageUrl,
    productUrl: liked.productUrl,
    retailer: liked.retailer,
    category,
    generatedAt: new Date().toISOString(),
  };
  const prevLooks = current.lookHistory || [];
  const withoutDup = prevLooks.filter((l) => l.imageUrl !== avatarImageUrl);
  const lookHistory = [newLook, ...withoutDup].slice(0, 50);

  const next: FigurePersist = {
    ...current,
    slots,
    avatarImageUrl,
    avatarMinimized: false,
    visible: true,
    liked: [liked, ...without].slice(0, 100),
    lookHistory,
  };
  await saveFigure(next);
  return next;
}

/** Restore a previously generated look as the active avatar image. */
export async function restoreGeneratedLook(lookId: string): Promise<FigurePersist> {
  const current = await loadFigure();
  const look = current.lookHistory?.find((l) => l.id === lookId);
  if (!look) return current;
  const next: FigurePersist = {
    ...current,
    avatarImageUrl: look.imageUrl,
    avatarMinimized: false,
    visible: true,
  };
  await saveFigure(next);
  return next;
}

/** Delete a cached generated look from history. */
export async function deleteGeneratedLook(lookId: string): Promise<FigurePersist> {
  const current = await loadFigure();
  const lookHistory = (current.lookHistory || []).filter((l) => l.id !== lookId);
  const next: FigurePersist = {
    ...current,
    lookHistory,
  };
  await saveFigure(next);
  return next;
}

/** Remove an individual clothing item from the figure by id or URL. */
export async function removeGarment(id: string): Promise<FigurePersist> {
  const current = await loadFigure();
  const nextLiked = current.liked.filter((item) => item.id !== id && item.productUrl !== id);
  const nextSlots = { ...current.slots };
  for (const [key, val] of Object.entries(nextSlots) as [keyof OutfitSlots, WornGarment | null][]) {
    if (val && (val.id === id || val.sourceUrl === id)) {
      nextSlots[key] = null;
    }
  }
  const hasRemaining = nextLiked.length > 0 || Object.values(nextSlots).some(Boolean);
  const next: FigurePersist = {
    ...current,
    liked: nextLiked,
    slots: nextSlots,
    avatarImageUrl: hasRemaining ? current.avatarImageUrl : null,
  };
  await saveFigure(next);
  return next;
}

/** Toggle or set inCart status on a liked garment. */
export async function toggleCart(id: string, forceInCart?: boolean): Promise<FigurePersist> {
  const current = await loadFigure();
  const nextLiked = current.liked.map((item) => {
    if (item.id === id || item.productUrl === id) {
      return {
        ...item,
        inCart: forceInCart !== undefined ? forceInCart : !item.inCart,
      };
    }
    return item;
  });
  const next: FigurePersist = {
    ...current,
    liked: nextLiked,
  };
  await saveFigure(next);
  return next;
}

export async function dismissFigure(): Promise<FigurePersist> {
  const current = await loadFigure();
  const next: FigurePersist = {
    ...current,
    silhouette: null,
    visible: false,
    slots: emptySlots(),
  };
  await saveFigure(next);
  return next;
}

export async function wearOnFigure(garment: WornGarment): Promise<FigurePersist> {
  const current = await loadFigure();
  const slots = applyWear(current.slots, garment);
  const closet = [
    garment,
    ...current.closet.filter(
      (g) => g.id !== garment.id && !(garment.sourceUrl && g.sourceUrl === garment.sourceUrl),
    ),
  ].slice(0, 80);

  const snapshot: SavedOutfit = {
    id: crypto.randomUUID(),
    name:
      garment.retailer || garment.brand
        ? `${garment.retailer ?? garment.brand} · ${garment.name}`.slice(0, 48)
        : garment.name.slice(0, 48),
    slots: structuredClone(slots),
    savedAt: new Date().toISOString(),
    sourceUrls: slotSourceUrls(slots),
  };

  const next: FigurePersist = {
    ...current,
    visible: Boolean(current.silhouette) || current.visible,
    slots,
    closet,
    savedOutfits: [snapshot, ...current.savedOutfits].slice(0, 40),
  };
  await saveFigure(next);
  return next;
}

/** Auto-save a product the user browsed. Deduped by URL, capped at 50 entries. */
export async function rememberBrowsedProduct(product: BrowsedProduct): Promise<FigurePersist> {
  const current = await loadFigure();
  const without = current.browsedProducts.filter((p) => p.productUrl !== product.productUrl);
  const next: FigurePersist = {
    ...current,
    browsedProducts: [product, ...without].slice(0, 50),
  };
  await saveFigure(next);
  return next;
}

/** Mark ALL liked garments as in-cart. */
export async function markAllInCart(): Promise<FigurePersist> {
  const current = await loadFigure();
  const next: FigurePersist = {
    ...current,
    liked: current.liked.map((item) => ({ ...item, inCart: true })),
  };
  await saveFigure(next);
  return next;
}

/** Remove a product from the browsed history. */
export async function removeBrowsedProduct(idOrUrl: string): Promise<FigurePersist> {
  const current = await loadFigure();
  const next: FigurePersist = {
    ...current,
    browsedProducts: current.browsedProducts.filter(
      (p) => p.id !== idOrUrl && p.productUrl !== idOrUrl,
    ),
  };
  await saveFigure(next);
  return next;
}

const PENDING_CART_KEY = 'fitmirror_pending_cart';

interface PendingCartEntry {
  url: string;
  timestamp: number;
}

/** Record that a product URL should be automatically added to cart once loaded. */
export async function markPendingCartAdd(url: string): Promise<void> {
  try {
    const store = await chrome.storage.local.get(PENDING_CART_KEY);
    const list: PendingCartEntry[] = Array.isArray(store[PENDING_CART_KEY])
      ? store[PENDING_CART_KEY]
      : [];
    const now = Date.now();
    // Retain entries under 3 minutes old
    const valid = list.filter((e) => typeof e === 'object' && e && now - e.timestamp < 180_000);
    valid.push({ url, timestamp: now });
    await chrome.storage.local.set({ [PENDING_CART_KEY]: valid });
  } catch (err) {
    console.error('Failed to mark pending cart add:', err);
  }
}

/** Check if the current URL has a pending add-to-cart request and consume it. */
export async function consumePendingCartAdd(currentUrl: string): Promise<boolean> {
  try {
    const store = await chrome.storage.local.get(PENDING_CART_KEY);
    const list: PendingCartEntry[] = Array.isArray(store[PENDING_CART_KEY])
      ? store[PENDING_CART_KEY]
      : [];
    if (list.length === 0) return false;

    const now = Date.now();
    let matched = false;
    let curObj: URL | null = null;
    try {
      curObj = new URL(currentUrl);
    } catch {}

    const remaining: PendingCartEntry[] = [];
    for (const entry of list) {
      if (!entry || typeof entry.url !== 'string' || now - entry.timestamp > 180_000) {
        continue;
      }
      if (!matched && curObj) {
        try {
          const entryObj = new URL(entry.url);
          const curHost = curObj.hostname.replace(/^www\./, '').toLowerCase();
          const entryHost = entryObj.hostname.replace(/^www\./, '').toLowerCase();
          const curPath = curObj.pathname.replace(/\/$/, '').toLowerCase();
          const entryPath = entryObj.pathname.replace(/\/$/, '').toLowerCase();

          // Match hostname and path (or path prefix to account for store redirects/locales)
          if (
            curHost === entryHost &&
            (curPath === entryPath || curPath.includes(entryPath) || entryPath.includes(curPath))
          ) {
            matched = true;
            continue; // Consume this entry
          }
        } catch {}
      }
      remaining.push(entry);
    }

    if (matched || remaining.length !== list.length) {
      await chrome.storage.local.set({ [PENDING_CART_KEY]: remaining });
    }

    return matched;
  } catch (err) {
    console.error('Failed to consume pending cart add:', err);
    return false;
  }
}
