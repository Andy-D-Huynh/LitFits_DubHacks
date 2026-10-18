export type GarmentCategory =
  | 'top'
  | 'bottom'
  | 'outerwear'
  | 'dress'
  | 'footwear'
  | 'accessory';

/** Soft garments drape on the torso or legs. Rigid items stay anchored and are not stretched. */
export type GarmentTrack = 'soft' | 'rigid';

export type ProductPrice = {
  amount: number;
  currency: string;
};

export type WornGarment = {
  id: string;
  name: string;
  category: GarmentCategory;
  track: GarmentTrack;
  primaryColor: string | null;
  primaryImageUrl: string | null;
  imageDataUrl: string | null;
  /** Transparent cutout when the retail photo has a plain background. */
  cutoutDataUrl: string | null;
  brand: string | null;
  sourceUrl: string | null;
  retailer: string | null;
  price: ProductPrice | null;
  addedAt: string;
};

export type OutfitSlots = {
  top: WornGarment | null;
  bottom: WornGarment | null;
  outerwear: WornGarment | null;
  dress: WornGarment | null;
  footwear: WornGarment | null;
  accessory: WornGarment | null;
};

export type Point = { x: number; y: number };

export type SilhouetteResult = {
  outline: Point[];
  outlineImageUrl: string;
  bounds: { x: number; y: number; width: number; height: number };
  width: number;
  height: number;
  createdAt: string;
};

export type SavedOutfit = {
  id: string;
  name: string;
  slots: OutfitSlots;
  savedAt: string;
  sourceUrls: string[];
};

/** A product the user tried on. The link is what goes in the shopping cart. */
export type LikedGarment = {
  id: string;
  productUrl: string;
  name: string;
  garmentImageUrl: string;
  retailer: string | null;
  addedAt: string;
};

export type FigurePersist = {
  silhouette: SilhouetteResult | null;
  visible: boolean;
  slots: OutfitSlots;
  closet: WornGarment[];
  savedOutfits: SavedOutfit[];
  /** Original full-body photo. Later try-ons start from the latest render. */
  modelImage: string | null;
  /** Latest Fashn image URL. Shown in the corner on every tab. */
  avatarImageUrl: string | null;
  /** Minimized corner avatar. The figure is still saved. */
  avatarMinimized: boolean;
  liked: LikedGarment[];
};

export const STORAGE_KEY = 'fitmirror-outline-figure';
