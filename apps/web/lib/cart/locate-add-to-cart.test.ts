import { describe, expect, it } from 'vitest';
import { buildLocatePrompt, parseLocateResult, type Candidate } from './locate-add-to-cart';

const candidates: Candidate[] = [
  { i: 0, tag: 'button', text: 'S' },
  { i: 1, tag: 'button', text: 'M' },
  { i: 2, tag: 'button', text: 'ADD' },
];

describe('parseLocateResult', () => {
  it('keeps valid indices and uses the exact page wording', () => {
    const result = parseLocateResult({ addToCart: 2, addToCartText: 'Add', size: 1 }, candidates);
    expect(result).toEqual({ addToCart: 2, addToCartText: 'ADD', size: 1 });
  });

  it('drops indices that are not on the page', () => {
    const result = parseLocateResult({ addToCart: 9, addToCartText: null, size: 7 }, candidates);
    expect(result).toEqual({ addToCart: null, addToCartText: null, size: null });
  });

  it('never treats the cart button as a size', () => {
    expect(parseLocateResult({ addToCart: 2, size: 2 }, candidates).size).toBeNull();
  });

  it('returns nothing for malformed output', () => {
    expect(parseLocateResult('nope', candidates).addToCart).toBeNull();
  });
});

describe('buildLocatePrompt', () => {
  it('lists every candidate on its own line', () => {
    const prompt = buildLocatePrompt({ url: 'https://shop.test/p', productName: 'Tee', candidates });
    expect(prompt).toContain('Product: Tee');
    expect(prompt.split('\n').filter((l) => l.startsWith('{"i":'))).toHaveLength(3);
  });
});
