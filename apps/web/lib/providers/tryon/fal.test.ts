import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FAL_TRYON_MODEL,
  FalTryOn,
  falCategoryFromText,
  toFalInput,
  type FalSubscribe,
} from './fal';
import { selectTryOnProvider } from './select';

// fal is always mocked here: no test makes a network call.

const input = {
  personImageUrl: 'https://signed.test/faceless.jpg?token=abc',
  garmentImageUrl: 'https://shop.test/tee.jpg',
  category: 'upper_body' as const,
  description: 'Acme tee',
};

describe('FalTryOn', () => {
  it('sends the FASHN v1.6 input shape and returns the first image', async () => {
    const subscribe = vi.fn<FalSubscribe>().mockResolvedValue({
      data: { images: [{ url: 'https://v3.fal.media/out.jpg', content_type: 'image/jpeg' }] },
      requestId: 'req-1',
    });
    const out = await new FalTryOn(subscribe).render(input);
    expect(out).toEqual({ imageUrl: 'https://v3.fal.media/out.jpg' });
    expect(subscribe).toHaveBeenCalledWith('fal-ai/fashn/tryon/v1.6', {
      model_image: 'https://signed.test/faceless.jpg?token=abc',
      garment_image: 'https://shop.test/tee.jpg',
      category: 'tops',
      mode: 'balanced',
      garment_photo_type: 'auto',
      moderation_level: 'permissive',
      segmentation_free: true,
      output_format: 'png',
      num_samples: 1,
    });
  });

  it('maps top → tops, bottom → bottoms, dress → one-pieces', () => {
    expect(toFalInput({ ...input, category: 'upper_body' }).category).toBe('tops');
    expect(toFalInput({ ...input, category: 'lower_body' }).category).toBe('bottoms');
    expect(toFalInput({ ...input, category: 'dresses' }).category).toBe('one-pieces');
  });

  it('maps free-text extension categories, falling back to auto', () => {
    expect(falCategoryFromText('top')).toBe('tops');
    expect(falCategoryFromText('outerwear')).toBe('tops');
    expect(falCategoryFromText('bottom')).toBe('bottoms');
    expect(falCategoryFromText('dress')).toBe('one-pieces');
    expect(falCategoryFromText('footwear')).toBe('auto');
    expect(falCategoryFromText(undefined)).toBe('auto');
  });

  it('renderImages sends fal-ready images unchanged', async () => {
    const subscribe = vi.fn<FalSubscribe>().mockResolvedValue({
      data: { images: [{ url: 'https://v3.fal.media/d.png' }] },
      requestId: 'r',
    });
    const out = await new FalTryOn(subscribe).renderImages({
      modelImage: 'data:image/jpeg;base64,AAAA',
      garmentImage: 'https://shop.test/shoe.jpg',
      category: 'auto',
    });
    expect(out.imageUrl).toBe('https://v3.fal.media/d.png');
    expect(subscribe.mock.calls[0]![1]).toMatchObject({
      model_image: 'data:image/jpeg;base64,AAAA',
      category: 'auto',
    });
  });

  it('uses the configured endpoint', async () => {
    const subscribe = vi.fn<FalSubscribe>().mockResolvedValue({
      data: { images: [{ url: 'https://v3.fal.media/x.jpg' }] },
      requestId: 'r',
    });
    await new FalTryOn(subscribe, 'fal-ai/fashn/tryon/v1.5').render(input);
    expect(subscribe.mock.calls[0]![0]).toBe('fal-ai/fashn/tryon/v1.5');
  });

  it('fails clearly when fal returns no image', async () => {
    const subscribe = vi
      .fn<FalSubscribe>()
      .mockResolvedValue({ data: { images: [] }, requestId: 'req-9' });
    await expect(new FalTryOn(subscribe).render(input)).rejects.toThrow(
      'fal returned no image (request req-9)',
    );
  });
});

describe('selectTryOnProvider', () => {
  const fakeFal = vi.fn<(key: string) => FalSubscribe>(() => vi.fn<FalSubscribe>());

  it('selects fal when TRYON_PROVIDER=fal and FAL_KEY is set, defaulting to FASHN v1.6', () => {
    const { provider, warning } = selectTryOnProvider(
      { TRYON_PROVIDER: 'fal', FAL_KEY: 'k' },
      false,
      fakeFal,
    );
    expect(provider.name).toBe('fal');
    expect(warning).toBeNull();
    expect(fakeFal).toHaveBeenCalledWith('k');
    expect(DEFAULT_FAL_TRYON_MODEL).toBe('fal-ai/fashn/tryon/v1.6');
  });

  it('falls back to the mock when FAL_KEY is missing', () => {
    const { provider, warning } = selectTryOnProvider({ TRYON_PROVIDER: 'fal' }, false, fakeFal);
    expect(provider.name).toBe('mock');
    expect(warning).toContain('FAL_KEY');
  });

  it('always uses the mock in demo mode and by default', () => {
    expect(
      selectTryOnProvider({ TRYON_PROVIDER: 'fal', FAL_KEY: 'k' }, true, fakeFal).provider.name,
    ).toBe('mock');
    expect(
      selectTryOnProvider({ TRYON_PROVIDER: 'mock', FAL_KEY: 'k' }, false, fakeFal).provider.name,
    ).toBe('mock');
  });

  it('keeps Replicate as an option, with the mock when its credentials are missing', () => {
    expect(
      selectTryOnProvider(
        { TRYON_PROVIDER: 'replicate', REPLICATE_API_TOKEN: 't', TRYON_MODEL: 'cuuupid/idm-vton' },
        false,
      ).provider.name,
    ).toBe('replicate');
    expect(selectTryOnProvider({ TRYON_PROVIDER: 'replicate' }, false).provider.name).toBe('mock');
  });
});
