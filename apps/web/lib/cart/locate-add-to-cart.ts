import { z } from 'zod';

// Gemini reads a compact list of the page's visible controls and points at the
// real "add to cart" button (and a size to pick first, when the store needs one).

export const CandidateSchema = z.object({
  i: z.number().int().min(0),
  tag: z.string().max(20),
  text: z.string().max(120),
  label: z.string().max(120).optional(),
  attrs: z.string().max(200).optional(),
  disabled: z.boolean().optional(),
  selected: z.boolean().optional(),
});

export type Candidate = z.infer<typeof CandidateSchema>;

export type LocateInput = {
  url: string;
  productName: string;
  candidates: Candidate[];
};

export type LocateResult = {
  addToCart: number | null;
  addToCartText: string | null;
  size: number | null;
};

const SYSTEM_INSTRUCTION = [
  'You find controls on online clothing store product pages.',
  'You get the visible interactive elements of one page, each with an index "i".',
  'Return the index of the button that adds THIS product to the shopping cart or bag.',
  'Its wording varies by store and language: "Add to cart", "Add to bag", "ADD", "Add", "Buy now", "In den Warenkorb", "Ajouter au panier".',
  'Never pick a link that only opens/views the cart, a wishlist/favorite button, a checkout button, or a size guide.',
  'If no size is selected yet and the store needs one, return the index of the first in-stock size option as "size"; otherwise "size" is null.',
  'Disabled elements are out of stock or unavailable; do not pick them for size.',
  'If nothing fits, return null for addToCart.',
].join(' ');

export function buildLocatePrompt(input: LocateInput): string {
  const lines = input.candidates.map((c) => JSON.stringify(c));
  return [
    `Page URL: ${input.url}`,
    `Product: ${input.productName || 'unknown'}`,
    'Elements (one JSON object per line):',
    ...lines,
  ].join('\n');
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    addToCart: { type: 'INTEGER', nullable: true },
    addToCartText: { type: 'STRING', nullable: true },
    size: { type: 'INTEGER', nullable: true },
  },
  required: ['addToCart', 'addToCartText', 'size'],
};

const RawResultSchema = z.object({
  addToCart: z.number().int().nullable(),
  addToCartText: z.string().nullable().optional(),
  size: z.number().int().nullable().optional(),
});

/** Drop indices the model made up so the extension only clicks real elements. */
export function parseLocateResult(raw: unknown, candidates: Candidate[]): LocateResult {
  const parsed = RawResultSchema.safeParse(raw);
  if (!parsed.success) return { addToCart: null, addToCartText: null, size: null };
  const known = new Set(candidates.map((c) => c.i));
  const pick = (i: number | null | undefined) => (i != null && known.has(i) ? i : null);
  const addToCart = pick(parsed.data.addToCart);
  const size = pick(parsed.data.size);
  const cartCandidate = candidates.find((c) => c.i === addToCart);
  return {
    addToCart,
    addToCartText: cartCandidate?.text || parsed.data.addToCartText || null,
    size: size === addToCart ? null : size,
  };
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
        contents: [{ role: 'user', parts: [{ text: buildLocatePrompt(input) }] }],
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
