import { trackForCategory } from './categorize';
import { detectHeadBox } from './head-box';
import { photoFingerprint } from './tryon-flow';
import { updateTryOnState } from './tryon-state';
import type {
  FigurePersist,
  GarmentCategory,
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
  // Locate the head now so try-on can blur it; a new photo starts a new look.
  const headBox = await detectHeadBox(modelImage);
  await updateTryOnState({
    photo: { fingerprint: photoFingerprint(modelImage), headBox },
    lastGoodRender: null,
    lastError: null,
  });
  return next;
}

export async function setAvatarMinimized(avatarMinimized: boolean): Promise<FigurePersist> {
  const current = await loadFigure();
  const next: FigurePersist = { ...current, avatarMinimized };
  await saveFigure(next);
  return next;
}

/** Replace the corner image and remember the product link for the cart. */
export async function applyTryOnResult(
  avatarImageUrl: string,
  liked: LikedGarment,
): Promise<FigurePersist> {
  const current = await loadFigure();
  const without = current.liked.filter((item) => item.productUrl !== liked.productUrl);
  const next: FigurePersist = {
    ...current,
    avatarImageUrl,
    avatarMinimized: false,
    visible: true,
    liked: [liked, ...without].slice(0, 100),
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
