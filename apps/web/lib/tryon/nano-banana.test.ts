import { describe, expect, it } from 'vitest';
import { buildNanoBananaPrompt } from './nano-banana';

describe('buildNanoBananaPrompt', () => {
  it('includes plain white background requirement in prompt', () => {
    const prompt = buildNanoBananaPrompt('Oversized Tee', 'top', 'regular', 'black');
    expect(prompt).toContain('BACKGROUND REQUIREMENT: Change the background to a clean, solid, seamless plain white studio background');
  });

  it('includes exact color match requirement in prompt', () => {
    const prompt = buildNanoBananaPrompt('Wide Leg Jeans', 'bottom', 'baggy', 'light vintage wash');
    expect(prompt).toContain('needs to be the exact same color');
    expect(prompt).toContain('light vintage wash');
  });

  it('incorporates baggy and fit specifications correctly', () => {
    const prompt = buildNanoBananaPrompt('Cargo Pants', 'bottom', 'baggy');
    expect(prompt).toContain('FIT SPECIFICATION: Make ONLY this newly added the bottom pants/jeans (Cargo Pants) fit distinctly loose, baggy, and relaxed');
  });

  it('incorporates cropped fit correctly', () => {
    const prompt = buildNanoBananaPrompt('Sweater', 'top', 'cropped');
    expect(prompt).toContain('FIT SPECIFICATION: Wear this the top/jacket (Sweater) neatly cropped / tucked in');
  });

  it('hardcodes DO NOT CHANGE THE FACE into the prompt', () => {
    const prompt = buildNanoBananaPrompt('Cardigan', 'outerwear', 'tight', 'red');
    expect(prompt).toContain('DO NOT CHANGE THE FACE');
    expect(prompt).toContain("Strictly preserve the person's exact face, facial features");
  });
});

