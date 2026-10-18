import { describe, expect, it } from 'vitest';
import type { FitResult } from './types';
import { addItem, outfitSummary, removeItem, swapItem, type OutfitEntry } from './outfit-rules';

const top: OutfitEntry = { slot: 'top', garmentId: 'tee', size: 'M', position: 0 };
const bottom: OutfitEntry = { slot: 'bottom', garmentId: 'chino', size: 'L', position: 1 };
const coat: OutfitEntry = { slot: 'outerwear', garmentId: 'jacket', size: 'M', position: 2 };
const dress: OutfitEntry = { slot: 'dress', garmentId: 'midi', size: 'S', position: 0 };

describe('addItem', () => {
  it('places an item in an empty slot at its layer position', () => {
    const r = addItem([coat], { garmentId: 'tee', category: 'top', size: 'M' });
    expect(r.items).toEqual([top, coat]);
    expect(r.removed).toEqual([]);
  });

  it('swaps when the slot is occupied and reports what it replaced', () => {
    const r = addItem([top, bottom], { garmentId: 'oxford', category: 'top', size: 'L' });
    expect(r.items.map((i) => i.garmentId)).toEqual(['oxford', 'chino']);
    expect(r.removed).toEqual([top]);
  });

  it('a dress replaces both top and bottom but keeps outerwear', () => {
    const r = addItem([top, bottom, coat], { garmentId: 'midi', category: 'dress', size: 'S' });
    expect(r.items).toEqual([dress, coat]);
    expect(r.removed).toEqual([top, bottom]);
  });

  it('a top or bottom replaces a worn dress', () => {
    const r = addItem([dress, coat], { garmentId: 'chino', category: 'bottom', size: 'L' });
    expect(r.items).toEqual([bottom, coat]);
    expect(r.removed).toEqual([dress]);
  });
});

describe('swapItem', () => {
  it('replaces the garment in place, keeping layer position', () => {
    const r = swapItem([top, coat], 'outerwear', {
      garmentId: 'parka',
      category: 'outerwear',
      size: 'L',
    });
    expect(r).toEqual({
      items: [top, { ...coat, garmentId: 'parka', size: 'L' }],
      removed: [coat],
    });
  });

  it('changes size when the garment is the same', () => {
    const r = swapItem([top], 'top', { garmentId: 'tee', category: 'top', size: 'L' });
    expect('items' in r && r.items).toEqual([{ ...top, size: 'L' }]);
  });

  it('rejects an empty slot and a category mismatch', () => {
    expect(
      swapItem([top], 'bottom', { garmentId: 'chino', category: 'bottom', size: 'L' }),
    ).toEqual({ error: 'slot_empty' });
    expect(swapItem([top], 'top', { garmentId: 'chino', category: 'bottom', size: 'L' })).toEqual({
      error: 'category_mismatch',
    });
  });
});

describe('removeItem', () => {
  it('empties the slot', () => {
    expect(removeItem([top, bottom], 'top')).toEqual({ items: [bottom], removed: [top] });
  });

  it('removing top or bottom while a dress is worn removes the dress', () => {
    expect(removeItem([dress, coat], 'bottom')).toEqual({ items: [coat], removed: [dress] });
  });

  it('is a no-op on an empty slot', () => {
    expect(removeItem([top], 'outerwear')).toEqual({ items: [top], removed: [] });
  });
});

describe('outfitSummary', () => {
  const fit = (size: string, overall: 'good' | 'tight', waist?: 'tight'): FitResult => ({
    garmentId: '00000000-0000-4000-8000-000000000001',
    recommendedSize: size,
    confidence: 'high',
    warnings: [],
    perSize: [
      {
        size,
        overall,
        score: 1,
        dims: waist ? [{ dim: 'waist', bodyCm: 84, verdict: waist, note: 'n' }] : [],
      },
    ],
  });

  it('describes each worn item in layer order', () => {
    expect(
      outfitSummary([bottom, top], { top: fit('M', 'good'), bottom: fit('L', 'tight', 'tight') }),
    ).toBe('Top fits, bottom is tight at the waist.');
  });

  it('handles an empty outfit', () => {
    expect(outfitSummary([], {})).toBe('Nothing worn yet.');
  });
});
