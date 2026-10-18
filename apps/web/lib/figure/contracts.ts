/**
 * Shared figure contracts for reconstruction, the persistent figure, and catalog try-on.
 *
 * Coordinate system (normalized figure space)
 * -------------------------------------------
 * Origin is the top-left of the person's bounding box after a 4% inset pad.
 * x increases to the right, y increases downward. Both axes are 0–1 relative
 * to that padded box. The box is NOT a square: its pixel aspect ratio is
 * `bounds.width / bounds.height` and renderers must keep `width / height`
 * equal to that ratio. Do not stretch the silhouette to a fixed template.
 *
 * `normalizedBounds` is different: it is the person box in working-image
 * coordinates (0–1 of the resized photo), before the pad.
 *
 * Garment `transform` uses figure space. `scaleX` and `scaleY` are the
 * overlay width and height in that space, not a multiplier around an origin.
 *
 * What a photo can and cannot tell us
 * ------------------------------------
 * A silhouette supports visible proportion estimates only. It is not a 3D
 * body model. Hidden anatomy, depth, and centimetre measurements are not
 * available from one uncalibrated photo. Absolute size still comes from the
 * user's measurement profile and the retailer's size chart (fit engine),
 * never from this image.
 */
import { z } from 'zod';
import type {
  BodyLandmarks,
  BodyProportions,
  GarmentCategory,
  GarmentTransform,
  Point,
  ReconstructionQuality,
  SilhouetteResult,
  WornGarment,
} from '@/lib/opencv/types';

export const GARMENT_CATEGORIES = ['top', 'bottom', 'outerwear', 'dress'] as const;

export const DEFAULT_LAYER_ORDER: Record<GarmentCategory, number> = {
  bottom: 0,
  top: 1,
  dress: 1,
  outerwear: 2,
};

/** Preset overlay boxes in normalized figure space. */
export const DEFAULT_GARMENT_TRANSFORM: Record<GarmentCategory, GarmentTransform> = {
  top: { x: 0.14, y: 0.18, scaleX: 0.72, scaleY: 0.34, rotation: 0 },
  bottom: { x: 0.18, y: 0.5, scaleX: 0.64, scaleY: 0.44, rotation: 0 },
  dress: { x: 0.16, y: 0.18, scaleX: 0.68, scaleY: 0.58, rotation: 0 },
  outerwear: { x: 0.1, y: 0.16, scaleX: 0.8, scaleY: 0.42, rotation: 0 },
};

const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const boundsSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

const pairSchema = z.tuple([pointSchema, pointSchema]);

export const bodyLandmarksSchema = z
  .object({
    shoulders: pairSchema.optional(),
    hips: pairSchema.optional(),
    elbows: pairSchema.optional(),
    wrists: pairSchema.optional(),
    knees: pairSchema.optional(),
    ankles: pairSchema.optional(),
    headTop: pointSchema.optional(),
  })
  .partial();

export const bodyProportionsSchema = z
  .object({
    torsoRatio: z.number().finite().nonnegative().optional(),
    upperLegRatio: z.number().finite().nonnegative().optional(),
    lowerLegRatio: z.number().finite().nonnegative().optional(),
    armRatio: z.number().finite().nonnegative().optional(),
    shoulderWidthRatio: z.number().finite().nonnegative().optional(),
    hipWidthRatio: z.number().finite().nonnegative().optional(),
    headRatio: z.number().finite().nonnegative().optional(),
  })
  .partial();

export const reconstructionQualitySchema = z.object({
  status: z.enum(['ok', 'low', 'failed']),
  messages: z.array(z.string()),
  usedFallback: z.boolean(),
  method: z.enum(['opencv', 'canvas', 'rejected']),
});

export const silhouetteAssetSchema = z.object({
  format: z.enum(['svg', 'png']),
  data: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

/**
 * Processing result. `outline` is required so the figure can clip garments
 * to the real contour; `silhouette` is the transparent renderable asset.
 */
export const bodyReconstructionSchema = z.object({
  id: z.string().min(1),
  imageWidth: z.number().positive(),
  imageHeight: z.number().positive(),
  silhouette: silhouetteAssetSchema,
  normalizedBounds: boundsSchema,
  outline: z.array(pointSchema).min(3),
  landmarks: bodyLandmarksSchema.optional(),
  proportions: bodyProportionsSchema.optional(),
  quality: reconstructionQualitySchema,
  createdAt: z.string().min(1),
});

export type BodyReconstruction = {
  id: string;
  imageWidth: number;
  imageHeight: number;
  silhouette: {
    format: 'svg' | 'png';
    data: string;
    width: number;
    height: number;
  };
  normalizedBounds: { x: number; y: number; width: number; height: number };
  outline: Point[];
  landmarks?: BodyLandmarks;
  proportions?: BodyProportions;
  quality: ReconstructionQuality;
  createdAt: string;
};

const priceSchema = z.object({
  amount: z.number().finite().nonnegative(),
  currency: z.string().min(1),
});

export const clothingProductSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  title: z.string().min(1),
  brand: z.string().min(1),
  category: z.enum(GARMENT_CATEGORIES),
  price: priceSchema.optional(),
  imageUrl: z.string().min(1),
  transparentImageUrl: z.string().min(1).optional(),
  productUrl: z.string().min(1),
  availableSizes: z.array(z.string()).optional(),
  color: z.string().optional(),
  /** True when price, URL, and inventory are sample data, not a live retailer. */
  sample: z.boolean().optional(),
});

export type ClothingProduct = z.infer<typeof clothingProductSchema>;

export const garmentTransformSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  scaleX: z.number().finite().positive(),
  scaleY: z.number().finite().positive(),
  rotation: z.number().finite(),
});

export const catalogQuerySchema = z.object({
  text: z.string().optional(),
  category: z.enum([...GARMENT_CATEGORIES, 'all']).optional(),
  brand: z.string().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  minPrice: z.number().finite().nonnegative().optional(),
  maxPrice: z.number().finite().nonnegative().optional(),
});

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export type RetailerAdapter = {
  readonly sourceId: string;
  readonly label: string;
  /** `demo` catalogs must be labeled as sample data in the UI. */
  readonly kind: 'demo' | 'live';
  search(query: CatalogQuery): Promise<ClothingProduct[]>;
};

export function aspectRatioOf(bounds: { width: number; height: number }): number {
  if (bounds.height <= 0) return 1;
  return bounds.width / bounds.height;
}

/** Output pixel size that preserves the person-box aspect ratio. */
export function renderSizeForBounds(
  bounds: { width: number; height: number },
  targetHeight = 640,
): { width: number; height: number } {
  const height = Math.max(1, Math.round(targetHeight));
  const width = Math.max(1, Math.round(height * aspectRatioOf(bounds)));
  return { width, height };
}

export function toSilhouetteResult(body: BodyReconstruction): SilhouetteResult {
  return {
    id: body.id,
    outline: body.outline,
    outlineImageUrl: body.silhouette.data,
    bounds: {
      x: body.normalizedBounds.x * body.imageWidth,
      y: body.normalizedBounds.y * body.imageHeight,
      width: body.normalizedBounds.width * body.imageWidth,
      height: body.normalizedBounds.height * body.imageHeight,
    },
    width: body.silhouette.width,
    height: body.silhouette.height,
    imageWidth: body.imageWidth,
    imageHeight: body.imageHeight,
    normalizedBounds: body.normalizedBounds,
    landmarks: body.landmarks,
    proportions: body.proportions,
    quality: body.quality,
    createdAt: body.createdAt,
  };
}

export function clothingProductToWornGarment(
  product: ClothingProduct,
  opts?: { size?: string | null; transform?: GarmentTransform },
): WornGarment {
  const category = product.category;
  return {
    id: `${product.source}:${product.id}`,
    productId: product.id,
    name: product.title,
    category,
    primaryColor: product.color ?? null,
    primaryImageUrl: product.imageUrl,
    imageDataUrl: null,
    transparentImageUrl: product.transparentImageUrl ?? null,
    brand: product.brand,
    sourceUrl: product.productUrl,
    retailer: product.brand,
    source: product.source,
    availableSizes: product.availableSizes,
    selectedSize: opts?.size ?? null,
    price: product.price ?? null,
    layerOrder: DEFAULT_LAYER_ORDER[category],
    transform: opts?.transform ?? DEFAULT_GARMENT_TRANSFORM[category],
    addedAt: new Date().toISOString(),
  };
}

export function parseClothingProduct(input: unknown): ClothingProduct {
  return clothingProductSchema.parse(input);
}

export function parseBodyReconstruction(input: unknown): BodyReconstruction {
  return bodyReconstructionSchema.parse(input) as BodyReconstruction;
}
