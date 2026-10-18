import { z } from 'zod';

// Gemini looks at a screenshot of the product page plus a compact list of its
// visible controls and points at the real "add to bag" button, a size to pick
// first when the store needs one, and a pop-up to close if one is in the way.

export const CandidateSchema = z.object({
  i: z.number().int().min(0),
  tag: z.string().max(20),
  text: z.string().max(120),
  label: z.string().max(120).optional(),
  attrs: z.string().max(200).optional(),
  rect: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  inView: z.boolean().optional(),
  disabled: z.boolean().optional(),
  selected: z.boolean().optional(),
  clicked: z.boolean().optional(),
});

export type Candidate = z.infer<typeof CandidateSchema>;

export type LocateInput = {
  url: string;
  productName: string;
  candidates: Candidate[];
  viewport?: { width: number; height: number };
  /** JPEG data URL of the visible viewport, scaled to CSS pixels. */
  screenshot?: string;
  /** What already failed on this page. */
  note?: string;
};

export type LocateResult = {
  addToCart: number | null;
  addToCartText: string | null;
  size: number | null;
  dismiss: number | null;
};

const SYSTEM_INSTRUCTION = [
  'You operate online clothing store product pages for a shopper.',
  'You get the visible interactive elements of one page, each with an index "i", its text, label, attributes and rect [x, y, width, height] in viewport pixels ("inView": false means scrolled off-screen).',
  'When a screenshot is attached it shows the viewport at the same pixel scale as the rects, so use it to see icon-only buttons and what is actually on screen.',
  'Return "addToCart": the index of the control that adds THIS product to the shopping bag/cart. Its wording varies: "Add to bag", "Add to cart", "ADD", "Add", "Buy now", "In den Warenkorb", "Ajouter au panier", or just a bag icon.',
  'Never pick a link that only opens the bag/cart, a wishlist/favorite/heart button, a checkout button, a "notify me" button, or a size guide. Elements marked "clicked": true already failed; avoid them unless picking a size makes them work.',
  'Return "size": if the product needs a size and none is selected, or the note says the page asked for a size, the index of the first in-stock size option (not disabled, not sold out). Otherwise null.',
  'Return "dismiss": if a cookie banner, newsletter pop-up, region selector or other overlay covers the page, the index of its close/accept button. Otherwise null.',
  'Use null for anything that does not exist.',
].join(' ');

export function buildLocatePrompt(input: LocateInput): string {
  return [
    `Page URL: ${input.url}`,
    `Product: ${input.productName || 'unknown'}`,
    input.viewport ? `Viewport: ${input.viewport.width}x${input.viewport.height}` : '',
    input.note ? `Note: ${input.note}` : '',
    'Elements (one JSON object per line):',
    ...input.candidates.map((c) => JSON.stringify(c)),
  ]
    .filter(Boolean)
    .join('\n');
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    addToCart: { type: 'INTEGER', nullable: true },
    addToCartText: { type: 'STRING', nullable: true },
    size: { type: 'INTEGER', nullable: true },
    dismiss: { type: 'INTEGER', nullable: true },
  },
  required: ['addToCart', 'addToCartText', 'size', 'dismiss'],
};

const RawResultSchema = z.object({
  addToCart: z.number().int().nullable(),
  addToCartText: z.string().nullable().optional(),
  size: z.number().int().nullable().optional(),
  dismiss: z.number().int().nullable().optional(),
});

const EMPTY: LocateResult = { addToCart: null, addToCartText: null, size: null, dismiss: null };

/** Drop indices the model made up so the extension only clicks real elements. */
export function parseLocateResult(raw: unknown, candidates: Candidate[]): LocateResult {
  const parsed = RawResultSchema.safeParse(raw);
  if (!parsed.success) return EMPTY;
  const known = new Set(candidates.map((c) => c.i));
  const pick = (i: number | null | undefined) => (i != null && known.has(i) ? i : null);
  const addToCart = pick(parsed.data.addToCart);
  const size = pick(parsed.data.size);
  const dismiss = pick(parsed.data.dismiss);
  const cartCandidate = candidates.find((c) => c.i === addToCart);
  return {
    addToCart,
    addToCartText: cartCandidate?.text || parsed.data.addToCartText || null,
    size: size === addToCart ? null : size,
    dismiss: dismiss === addToCart ? null : dismiss,
  };
}

function screenshotPart(dataUrl: string | undefined) {
  const match = dataUrl?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  return match ? [{ inlineData: { mimeType: match[1], data: match[2] } }] : [];
}

export async function locateAddToCart(
  input: LocateInput,
  apiKey: string,
  model: string,
): Promise<LocateResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [
          {
            role: 'user',
            parts: [...screenshotPart(input.screenshot), { text: buildLocatePrompt(input) }],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  return parseLocateResult(raw, input.candidates);
}
