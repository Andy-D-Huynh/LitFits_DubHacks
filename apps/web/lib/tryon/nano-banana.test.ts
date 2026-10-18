import { describe, expect, it } from 'vitest';
import { buildNanoBananaPrompt } from './nano-banana';

describe('buildNanoBananaPrompt', () => {
  it('includes plain white background requirement in prompt', () => {
    const prompt = buildNanoBananaPrompt('Oxford shirt', 'top', { size: 'M', offered: ['S', 'M', 'L'] }, 'black');
    expect(prompt).toContain(
      'BACKGROUND REQUIREMENT: Change the background to a clean, solid, seamless plain white studio background',
    );
  });

  it('includes exact color match requirement in prompt', () => {
    const prompt = buildNanoBananaPrompt(
      'Wide Leg Jeans',
      'bottom',
      { size: '32', offered: ['30', '32', '34'] },
      'light vintage wash',
    );
    expect(prompt).toContain('needs to be the exact same color');
    expect(prompt).toContain('light vintage wash');
  });

  it('wears the chosen page size without resizing the person', () => {
    const prompt = buildNanoBananaPrompt('Cargo Pants', 'bottom', {
      size: 'XL',
      offered: ['S', 'M', 'L', 'XL'],
    });
    expect(prompt).toContain('size "XL"');
    expect(prompt).toContain('the largest size in this run');
    expect(prompt).toContain('BODY PROPORTION REQUIREMENT');
    expect(prompt).toContain('Do not enlarge the person');
    expect(prompt).not.toContain('baggy');
  });

  it('describes the smallest listed size on the same body', () => {
    const prompt = buildNanoBananaPrompt('Sweater', 'top', { size: 'XS', offered: ['XS', 'S', 'M', 'L'] });
    expect(prompt).toContain('the smallest size in this run');
    expect(prompt).toContain('Do not shrink the person');
  });

  it('hardcodes DO NOT CHANGE THE FACE into the prompt', () => {
    const prompt = buildNanoBananaPrompt('Cardigan', 'outerwear', { size: 'M', offered: ['S', 'M', 'L'] }, 'red');
    expect(prompt).toContain('DO NOT CHANGE THE FACE');
    expect(prompt).toContain("Strictly preserve the person's exact face, facial features");
  });
});
