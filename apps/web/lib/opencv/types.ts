export type Point = { x: number; y: number };

export type GarmentCategory = 'top' | 'bottom' | 'outerwear' | 'dress';

/**
 * Axis-aligned box. Pixel boxes are in the working image.
 * Normalized boxes use the figure coordinate system documented in
 * `apps/web/lib/figure/contracts.ts`.
 */
export type Bounds = { x: number; y: number; width: number; height: number };

/**
 * Optional landmarks in normalized figure space (0–1, y down).
 * Absent landmarks must be treated as unknown, never as (0, 0).
 */
export type BodyLandmarks = {
  shoulders?: [Point, Point];
  hips?: [Point, Point];
  elbows?: [Point, Point];
  wrists?: [Point, Point];
  knees?: [Point, Point];
  ankles?: [Point, Point];
  headTop?: Point;
};

/**
 * Ratios of the silhouette height (or width/height for widths).
 * These are visible-proportion estimates, not centimetre measurements.
 */
export type BodyProportions = {
  torsoRatio?: number;
  upperLegRatio?: number;
  lowerLegRatio?: number;
  armRatio?: number;
  shoulderWidthRatio?: number;
  hipWidthRatio?: number;
  headRatio?: number;
};

export type ReconstructionQuality = {
  status: 'ok' | 'low' | 'failed';
  messages: string[];
  usedFallback: boolean;
  method: 'opencv' | 'canvas' | 'rejected';
};

export type SilhouetteResult = {
  /** Stable id. Older persisted figures may omit it. */
  id?: string;
  /** Normalized contour points in 0–1 figure space (padded person box). */
  outline: Point[];
  /** Transparent PNG data URL of the filled outline. Aspect matches `width`/`height`. */
  outlineImageUrl: string;
  /** Person bounding box in working-image pixels. */
  bounds: Bounds;
  /** Render size in pixels. `width / height` must match the person-box aspect ratio. */
  width: number;
  height: number;
  /** Working-image size the bounds were measured in. */
  imageWidth?: number;
  imageHeight?: number;
  /** Person box in 0–1 working-image coordinates (not the padded figure space). */
  normalizedBounds?: Bounds;
  landmarks?: BodyLandmarks;
  proportions?: BodyProportions;
  quality?: ReconstructionQuality;
  createdAt: string;
};

/**
 * Garment box in normalized figure space.
 * `x`/`y` are the top-left. `scaleX`/`scaleY` are width and height in that
 * same 0–1 space (not a scale factor around an origin). `rotation` is degrees clockwise.
 */
export type GarmentTransform = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
};

export type WornGarment = {
  id: string;
  name: string;
  category: GarmentCategory;
  primaryColor: string | null;
  /** Remote product image URL when available */
  primaryImageUrl: string | null;
  /** Local data URL so the exact product image survives offline / CORS */
  imageDataUrl: string | null;
  /** Transparent try-on asset. Distinct from the catalog product photo. */
  transparentImageUrl?: string | null;
  brand: string | null;
  sourceUrl: string | null;
  retailer: string | null;
  /** Catalog source id, e.g. "demo-catalog". */
  source?: string | null;
  /** Stable catalog product id when this garment came from a catalog. */
  productId?: string | null;
  availableSizes?: string[];
  selectedSize?: string | null;
  price?: { amount: number; currency: string } | null;
  /** Lower draws first. Defaults: bottom 0, top/dress 1, outerwear 2. */
  layerOrder?: number;
  transform?: GarmentTransform;
  addedAt: string;
};

export type OutfitSlots = {
  top: WornGarment | null;
  bottom: WornGarment | null;
  outerwear: WornGarment | null;
  dress: WornGarment | null;
};

export type SavedOutfit = {
  id: string;
  name: string;
  slots: OutfitSlots;
  savedAt: string;
  /** Source URLs that contributed items when this snapshot was saved */
  sourceUrls: string[];
};

export type FigureCorner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export type FigureDisplayPrefs = {
  minimized: boolean;
  corner: FigureCorner;
};

export const FIGURE_STORAGE_KEY = 'fitmirror-outline-figure';
