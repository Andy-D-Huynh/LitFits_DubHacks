import { fal } from '@fal-ai/client';
import { env } from '@/lib/env';

export type FitStyle = 'regular' | 'baggy' | 'tight' | 'oversized' | 'cropped';

export type FluxTryOnInput = {
  modelImage: string;
  garmentImage: string;
  name: string;
  category?: string;
  fit?: FitStyle;
  color?: string | null;
};

type FluxOutput = {
  images?: Array<{ url?: string; content_type?: string }>;
  prompt?: string;
};

/**
 * Builds explicit styling instructions for FLUX Virtual Try-On [pro].
 * Hardcodes fit instructions (baggy, tight, regular) strictly for the target item,
 * and explicitly tells the model which garment to transfer (e.g. only pants, not the model's top),
 * while strictly preserving the exact colorway and wash.
 */
export function buildFluxPrompt(
  name: string,
  category: string = 'clothing',
  fit: FitStyle = 'regular',
  color?: string | null,
): string {
  const cat = category.toLowerCase();
  const lowerName = name.toLowerCase();

  const isBottom =
    /bottom|pant|jean|trouser|short|skirt|jogger|cargo|legging|slack/.test(cat) ||
    /pant|jean|trouser|short|skirt|jogger|cargo|legging|slack/.test(lowerName);

  const isTop =
    /top|shirt|tee|jacket|coat|hoodie|sweater|blazer|outerwear/.test(cat) ||
    /top|shirt|tee|jacket|coat|hoodie|sweater|blazer/.test(lowerName);

  const isDress = /dress|gown|jumpsuit|romper|one-piece/.test(cat) || /dress|gown|jumpsuit|romper/.test(lowerName);

  let targetGarment = `the ${name}`;
  let isolationDirective = '';

  if (isBottom) {
    targetGarment = `the bottom pants/jeans (${name})`;
    isolationDirective =
      'CRITICAL: Identify and transfer ONLY the pants/bottoms shown in the garment reference photo. Do NOT transfer, copy, or blend the top, jacket, or shirt that the model in the garment photo is wearing. Keep the person\'s existing upper body clothing completely unchanged.';
  } else if (isTop) {
    targetGarment = `the top/jacket (${name})`;
    isolationDirective =
      'CRITICAL: Identify and transfer ONLY the top garment (shirt/jacket/top) from the garment reference photo. Do NOT alter or replace the person\'s existing pants or bottom clothing.';
  } else if (isDress) {
    targetGarment = `the dress/full outfit (${name})`;
    isolationDirective = 'Dress the person in the reference garment with natural drape.';
  }

  const colorSpec = color && color.trim()
    ? `COLOR REQUIREMENT: The clothing needs to be the exact same color as the garment image (matching "${color.trim()}"). Do not change or shift the color.`
    : `COLOR REQUIREMENT: The clothing needs to be the exact same color, shade, and wash as the garment image. Do not change, shift, or alter the color.`;

  let fitDirective = '';
  switch (fit) {
    case 'baggy':
      fitDirective = `FIT SPECIFICATION: Make ONLY this newly added ${targetGarment} fit distinctly loose, baggy, and relaxed, with trendy streetwear fabric stacking and generous drape. Do NOT alter or make baggy any other existing clothes on the person.`;
      break;
    case 'oversized':
      fitDirective = `FIT SPECIFICATION: Make ONLY this newly added ${targetGarment} oversized and slouchy, with extra volume. Keep all other garments on the person at their original fit.`;
      break;
    case 'tight':
      fitDirective = `FIT SPECIFICATION: Make ONLY this newly added ${targetGarment} form-fitting, snug, and tight, with a sleek slim-fit silhouette that hugs the body. Do NOT modify the fit of any other clothes on the person.`;
      break;
    case 'cropped':
      fitDirective = `FIT SPECIFICATION: Wear this ${targetGarment} neatly cropped / tucked in with a clean hem.`;
      break;
    case 'regular':
    default:
      fitDirective = `FIT SPECIFICATION: Wear this ${targetGarment} with a standard, natural, tailored regular fit.`;
      break;
  }

  return `High-end commercial fashion studio photography. The person wears ${targetGarment} from the reference image. The clothing needs to be the exact same color as the garment image. ${isolationDirective} ${colorSpec} ${fitDirective} Seamless realistic lighting, perfect fabric textures, 8k resolution.`;
}

async function uploadIfDataUri(urlOrDataUri: string): Promise<string> {
  if (!urlOrDataUri.startsWith('data:')) {
    return urlOrDataUri;
  }
  const match = urlOrDataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return urlOrDataUri;
  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const blob = new Blob([buffer], { type: mime });
  return await fal.storage.upload(blob);
}

/**
 * Server-side call to fal-ai/flux-pro/v1/vto using @fal-ai/client.
 */
export async function renderFluxTryOn(input: FluxTryOnInput): Promise<string> {
  const key = env().FAL_KEY;
  if (!key) {
    throw new Error('FAL_KEY is not set on the server');
  }

  fal.config({ credentials: key });

  const prompt = buildFluxPrompt(input.name, input.category, input.fit || 'regular', input.color);

  console.log(`[FLUX VTO] Preparing try-on for "${input.name}" (category: ${input.category || 'auto'}, fit: ${input.fit || 'regular'}, color: ${input.color || 'auto'})`);
  const [humanImageUrl, garmentImageUrl] = await Promise.all([
    uploadIfDataUri(input.modelImage),
    uploadIfDataUri(input.garmentImage),
  ]);
  console.log('[FLUX VTO] Ready to subscribe with URLs:', { humanImageUrl, garmentImageUrl });

  const result = await fal.subscribe('fal-ai/flux-pro/v1/vto', {
    input: {
      prompt,
      human_image_url: humanImageUrl,
      garment_image_url: garmentImageUrl,
      output_format: 'jpeg',
      enable_safety_checker: true,
    },
    logs: true,
    onQueueUpdate: (update) => {
      console.log('[FLUX VTO Queue]', update.status);
    },
  });

  const data = result.data as FluxOutput;
  const url = data.images?.[0]?.url;
  if (!url) {
    throw new Error('FLUX Virtual Try-On completed without returning an image');
  }

  return url;
}
