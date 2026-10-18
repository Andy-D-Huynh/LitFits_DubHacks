import { fal } from '@fal-ai/client';

export type FitStyle = 'regular' | 'baggy' | 'tight' | 'oversized' | 'cropped';

export type NanoBananaTryOnInput = {
  modelImage: string;
  garmentImage: string;
  name: string;
  category?: string;
  fit?: FitStyle;
  color?: string | null;
};

type NanoBananaOutput = {
  images?: Array<{ url?: string; content_type?: string; file_name?: string }>;
  description?: string;
};

/**
 * Builds explicit styling instructions for fal-ai/nano-banana-pro/edit.
 * Preserves all prompt requirements:
 * 1. Exact color fidelity: "needs to be the same color as the image"
 * 2. Solid plain white studio background
 * 3. Specific fit instructions: regular, baggy, tight, oversized, cropped
 * 4. Transfer only the targeted garment (pants vs tops vs dresses)
 */
export function buildNanoBananaPrompt(
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

  const isDress =
    /dress|gown|jumpsuit|romper|one-piece/.test(cat) ||
    /dress|gown|jumpsuit|romper/.test(lowerName);

  let targetGarment = `the ${name}`;
  let isolationDirective = '';

  if (isBottom) {
    targetGarment = `the bottom pants/jeans (${name})`;
    isolationDirective =
      "CRITICAL: Identify and transfer ONLY the pants/bottoms shown in the garment reference photo. Do NOT transfer, copy, or blend the top, jacket, or shirt that the model in the garment photo is wearing. Keep the person's existing upper body clothing completely unchanged.";
  } else if (isTop) {
    targetGarment = `the top/jacket (${name})`;
    isolationDirective =
      "CRITICAL: Identify and transfer ONLY the top garment (shirt/jacket/top) from the garment reference photo. Do NOT alter or replace the person's existing pants or bottom clothing.";
  } else if (isDress) {
    targetGarment = `the dress/full outfit (${name})`;
    isolationDirective = 'Dress the person in the reference garment with natural drape.';
  }

  const colorSpec =
    color && color.trim()
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

  const faceDirective =
    'FACE REQUIREMENT: DO NOT CHANGE THE FACE. Strictly preserve the person\'s exact face, facial features, expression, eyes, skin tone, hair, and head from the first image with 100% identity fidelity. DO NOT CHANGE THE FACE.';

  const backgroundDirective =
    'BACKGROUND REQUIREMENT: Change the background to a clean, solid, seamless plain white studio background.';

  return `High-end commercial fashion studio photography on a solid plain white background. The person in the first image wears ${targetGarment} from the second reference garment image. The clothing needs to be the exact same color as the garment image. DO NOT CHANGE THE FACE. ${faceDirective} ${backgroundDirective} ${isolationDirective} ${colorSpec} ${fitDirective} Seamless realistic lighting, perfect fabric textures, 8k resolution.`;
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
 * Server-side call to fal-ai/nano-banana-pro/edit using @fal-ai/client.
 */
export async function renderNanoBananaTryOn(input: NanoBananaTryOnInput): Promise<string> {
  const key = process.env.FAL_KEY;
  if (!key) {
    throw new Error('FAL_KEY is not set on the server');
  }

  fal.config({ credentials: key });

  const prompt = buildNanoBananaPrompt(
    input.name,
    input.category,
    input.fit || 'regular',
    input.color,
  );

  console.log(
    `[Nano Banana Pro] Preparing try-on for "${input.name}" (category: ${input.category || 'auto'}, fit: ${input.fit || 'regular'}, color: ${input.color || 'auto'})`,
  );
  const [humanImageUrl, garmentImageUrl] = await Promise.all([
    uploadIfDataUri(input.modelImage),
    uploadIfDataUri(input.garmentImage),
  ]);
  console.log('[Nano Banana Pro] Ready to subscribe with URLs:', { humanImageUrl, garmentImageUrl });

  const result = await fal.subscribe('fal-ai/nano-banana-pro/edit', {
    input: {
      prompt,
      system_prompt:
        "DO NOT CHANGE THE FACE. Strictly preserve the person's exact face, facial features, identity, expression, and hairstyle from the first image with zero modification.",
      image_urls: [humanImageUrl, garmentImageUrl],
      num_images: 1,
      aspect_ratio: 'auto',
      output_format: 'png',
      resolution: '1K',
      safety_tolerance: '4',
      limit_generations: true,
    },
    logs: true,
    onQueueUpdate: (update) => {
      console.log('[Nano Banana Pro Queue]', update.status);
      if (update.status === 'IN_PROGRESS' && Array.isArray((update as any).logs)) {
        (update as any).logs.forEach((log: { message: string }) =>
          console.log('[Nano Banana Pro Log]', log.message),
        );
      }
    },
  });

  const data = result.data as NanoBananaOutput;
  const url = data.images?.[0]?.url;
  if (!url) {
    throw new Error('Nano Banana Pro completed without returning an image');
  }

  return url;
}
