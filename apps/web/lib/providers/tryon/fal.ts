import { createFalClient } from '@fal-ai/client';
import { z } from 'zod';
import type { TryOnCategory, TryOnInput, TryOnProvider } from './types';

// fal.ai try-on (FASHN). Endpoint and schema from
// https://fal.ai/models/fal-ai/fashn/tryon/v1.6/api. No 'server-only' import so
// the try-on smoke script can use it; FAL_KEY is still server-side only.

export const DEFAULT_FAL_TRYON_MODEL = 'fal-ai/fashn/tryon/v1.6';

const FAL_CATEGORY: Record<TryOnCategory, 'tops' | 'bottoms' | 'one-pieces'> = {
  upper_body: 'tops',
  lower_body: 'bottoms',
  dresses: 'one-pieces',
};

const FalOutputSchema = z.object({
  images: z.array(z.object({ url: z.url() })).min(1),
});

export type FalInput = {
  model_image: string;
  garment_image: string;
  category: 'tops' | 'bottoms' | 'one-pieces';
  mode: 'performance' | 'balanced' | 'quality';
  garment_photo_type: 'auto' | 'model' | 'flat-lay';
  output_format: 'png' | 'jpeg';
  num_samples: number;
};

// The one fal call we make; injectable so tests never touch the network.
export type FalSubscribe = (
  endpoint: string,
  input: FalInput,
) => Promise<{ data: unknown; requestId: string }>;

export function falSubscribeWithKey(key: string): FalSubscribe {
  const client = createFalClient({ credentials: key });
  return (endpoint, input) => client.subscribe(endpoint, { input });
}

export function toFalInput(input: TryOnInput): FalInput {
  return {
    model_image: input.personImageUrl,
    garment_image: input.garmentImageUrl,
    category: FAL_CATEGORY[input.category],
    mode: 'balanced',
    garment_photo_type: 'auto',
    output_format: 'jpeg',
    num_samples: 1,
  };
}

export class FalTryOn implements TryOnProvider {
  readonly name = 'fal';

  constructor(
    private readonly subscribe: FalSubscribe,
    private readonly endpoint: string = DEFAULT_FAL_TRYON_MODEL,
  ) {}

  async render(input: TryOnInput): Promise<{ imageUrl: string }> {
    const { data, requestId } = await this.subscribe(this.endpoint, toFalInput(input));
    const parsed = FalOutputSchema.safeParse(data);
    if (!parsed.success) throw new Error(`fal returned no image (request ${requestId})`);
    return { imageUrl: parsed.data.images[0]!.url };
  }
}
