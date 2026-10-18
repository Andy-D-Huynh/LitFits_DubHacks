import { fal } from '@fal-ai/client';
import { env } from '@/lib/env';
import type { FashnCategory } from './fashn-category';

export type { FashnCategory } from './fashn-category';
export { fashnCategory } from './fashn-category';

export type FashnTryOnInput = {
  modelImage: string;
  garmentImage: string;
  category: FashnCategory;
};

type FashnOutput = {
  images?: Array<{ url?: string }>;
};

/**
 * Server-side Fashn v1.6 call. The extension never sees FAL_KEY.
 * `modelImage` is the current avatar (original photo, then the previous render).
 */
export async function renderFashnTryOn(input: FashnTryOnInput): Promise<string> {
  const key = env().FAL_KEY;
  if (!key) {
    throw new Error('FAL_KEY is not set on the server');
  }
  fal.config({ credentials: key });
  const result = await fal.subscribe('fal-ai/fashn/tryon/v1.6', {
    input: {
      model_image: input.modelImage,
      garment_image: input.garmentImage,
      category: input.category,
      mode: 'balanced',
      garment_photo_type: 'auto',
      moderation_level: 'permissive',
      num_samples: 1,
      segmentation_free: true,
      output_format: 'png',
    },
  });
  const data = result.data as FashnOutput;
  const url = data.images?.[0]?.url;
  if (!url) throw new Error('Try-on finished without an image');
  return url;
}
