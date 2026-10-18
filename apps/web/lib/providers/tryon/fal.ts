import { createFalClient } from '@fal-ai/client';
import { z } from 'zod';
import type { TryOnCategory, TryOnInput, TryOnProvider } from './types';

// fal.ai try-on (FASHN). Endpoint and schema from
// https://fal.ai/models/fal-ai/fashn/tryon/v1.6/api. No 'server-only' import so
// the try-on smoke script can use it; FAL_KEY is still server-side only.
// moderation_level and segmentation_free follow the extension prototype's
// settings, which were verified against the live endpoint.

export const DEFAULT_FAL_TRYON_MODEL = 'fal-ai/fashn/tryon/v1.6';

export type FalCategory = 'tops' | 'bottoms' | 'one-pieces' | 'auto';

const FAL_CATEGORY: Record<TryOnCategory, FalCategory> = {
  upper_body: 'tops',
  lower_body: 'bottoms',
  dresses: 'one-pieces',
};

/** Map a free-text page category (from the extension) onto FASHN's categories. */
export function falCategoryFromText(category: string | null | undefined): FalCategory {
  if (category === 'top' || category === 'outerwear' || category === 'tops') return 'tops';
  if (category === 'bottom' || category === 'bottoms') return 'bottoms';
  if (category === 'dress' || category === 'one-pieces') return 'one-pieces';
  return 'auto';
}

const FalOutputSchema = z.object({
  images: z.array(z.object({ url: z.url() })).min(1),
});

export type FalInput = {
  model_image: string;
  garment_image: string;
  category: FalCategory;
  mode: 'performance' | 'balanced' | 'quality';
  garment_photo_type: 'auto' | 'model' | 'flat-lay';
  moderation_level: 'none' | 'permissive' | 'conservative';
  segmentation_free: boolean;
  output_format: 'png' | 'jpeg';
  num_samples: number;
};

/** The images and category for one fal call, already in fal's terms. */
export type FalImages = { modelImage: string; garmentImage: string; category: FalCategory };

// The one fal call we make; injectable so tests never touch the network.
export type FalSubscribe = (
  endpoint: string,
  input: FalInput,
) => Promise<{ data: unknown; requestId: string }>;

export function falSubscribeWithKey(key: string): FalSubscribe {
  const client = createFalClient({ credentials: key });
  return (endpoint, input) => client.subscribe(endpoint, { input });
}

export function falInput(images: FalImages): FalInput {
  return {
    model_image: images.modelImage,
    garment_image: images.garmentImage,
    category: images.category,
    mode: 'balanced',
    garment_photo_type: 'auto',
    moderation_level: 'permissive',
    segmentation_free: true,
    output_format: 'png',
    num_samples: 1,
  };
}

export function toFalInput(input: TryOnInput): FalInput {
  return falInput({
    modelImage: input.personImageUrl,
    garmentImage: input.garmentImageUrl,
    category: FAL_CATEGORY[input.category],
  });
}

export class FalTryOn implements TryOnProvider {
  readonly name = 'fal';

  constructor(
    private readonly subscribe: FalSubscribe,
    private readonly endpoint: string = DEFAULT_FAL_TRYON_MODEL,
  ) {}

  render(input: TryOnInput): Promise<{ imageUrl: string }> {
    return this.call(toFalInput(input));
  }

  /** For callers that already hold fal-ready images, e.g. the extension's direct route. */
  renderImages(images: FalImages): Promise<{ imageUrl: string }> {
    return this.call(falInput(images));
  }

  private async call(input: FalInput): Promise<{ imageUrl: string }> {
    const { data, requestId } = await this.subscribe(this.endpoint, input);
    const parsed = FalOutputSchema.safeParse(data);
    if (!parsed.success) throw new Error(`fal returned no image (request ${requestId})`);
    return { imageUrl: parsed.data.images[0]!.url };
  }
}
