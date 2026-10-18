import { describe, expect, it } from 'vitest';
import { buildLocatePrompt, parseLocateResult, type Candidate } from './locate-add-to-cart';

const candidates: Candidate[] = [
  { i: 0, tag: 'button', text: 'S' },
  { i: 1, tag: 'button', text: 'M' },
  { i: 2, tag: 'button', text: 'ADD' },
  { i: 3, tag: 'button', text: 'Accept all cookies' },
];

describe('parseLocateResult', () => {
  it('keeps valid indices and uses the exact page wording', () => {
    const result = parseLocateResult(
      { addToCart: 2, addToCartText: 'Add', size: 1, dismiss: 3 },
      candidates,
    );
    expect(result).toEqual({ addToCart: 2, addToCartText: 'ADD', size: 1, dismiss: 3 });
  });

  it('drops indices that are not on the page', () => {
    const result = parseLocateResult({ addToCart: 9, addToCartText: null, size: 7, dismiss: 8 }, candidates);
    expect(result).toEqual({ addToCart: null, addToCartText: null, size: null, dismiss: null });
  });

  it('never treats the bag button as a size or a pop-up close', () => {
    const result = parseLocateResult({ addToCart: 2, size: 2, dismiss: 2 }, candidates);
    expect(result.size).toBeNull();
    expect(result.dismiss).toBeNull();
  });

  it('returns nothing for malformed output', () => {
    expect(parseLocateResult('nope', candidates).addToCart).toBeNull();
  });
});

describe('buildLocatePrompt', () => {
  it('lists every candidate and the failure note', () => {
    const prompt = buildLocatePrompt({
      url: 'https://shop.test/p',
      productName: 'Tee',
      candidates,
      viewport: { width: 1280, height: 720 },
      note: 'Clicking "ADD" made the page ask for a size.',
    });
    expect(prompt).toContain('Product: Tee');
    expect(prompt).toContain('Viewport: 1280x720');
    expect(prompt).toContain('Note: Clicking "ADD"');
    expect(prompt.split('\n').filter((l) => l.startsWith('{"i":'))).toHaveLength(4);
  });
});
