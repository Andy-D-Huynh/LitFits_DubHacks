import { describe, expect, it } from 'vitest';
import type { OutfitSlots, SavedOutfit, SilhouetteResult, WornGarment } from '../opencv/types';
import {
  CORNER_CYCLE,
  cycleCorner,
  dismissFigure,
  emptySlots,
  hideFigure,
  initialFigureData,
  showFigure,
  wearGarment,
} from './figure-reducer';

function silhouette(): SilhouetteResult {
  return {
    id: 'sil-1',
    outline: [
      { x: 0.2, y: 0.05 },
      { x: 0.8, y: 0.05 },
      { x: 0.7, y: 0.95 },
      { x: 0.3, y: 0.95 },
    ],
    outlineImageUrl: 'data:image/png;base64,abc',
    bounds: { x: 0, y: 0, width: 100, height: 200 },
    width: 100,
    height: 200,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function garment(category: WornGarment['category'], id: string = category): WornGarment {
  return {
    id,
    name: id,
    category,
    primaryColor: null,
    primaryImageUrl: null,
    imageDataUrl: null,
    brand: null,
    sourceUrl: null,
    retailer: null,
    addedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('figure reducer', () => {
  it('dismiss clears silhouette and slots, keeps closet and saved outfits', () => {
    const closet = [garment('top', 'tee')];
    const savedOutfits: SavedOutfit[] = [
      {
        id: 'outfit-1',
        name: 'Layered',
        slots: { ...emptySlots(), top: closet[0] ?? null },
        savedAt: '2026-01-02T00:00:00.000Z',
        sourceUrls: [],
      },
    ];
    const slots: OutfitSlots = {
      ...emptySlots(),
      top: closet[0] ?? null,
      outerwear: garment('outerwear', 'coat'),
    };

    const next = dismissFigure({
      ...initialFigureData(),
      silhouette: silhouette(),
      visible: true,
      minimized: true,
      slots,
      closet,
      savedOutfits,
      corner: 'bottom-left',
    });

    expect(next.visible).toBe(false);
    expect(next.silhouette).toBeNull();
    expect(next.slots).toEqual(emptySlots());
    expect(next.closet).toBe(closet);
    expect(next.savedOutfits).toBe(savedOutfits);
    expect(next.corner).toBe('bottom-left');
  });

  it('hide then show restores the same silhouette', () => {
    const outline = silhouette();
    const slots: OutfitSlots = { ...emptySlots(), bottom: garment('bottom', 'trousers') };
    const hidden = hideFigure({
      ...initialFigureData(),
      silhouette: outline,
      visible: true,
      minimized: true,
      slots,
    });

    expect(hidden.visible).toBe(false);
    expect(hidden.silhouette).toBe(outline);
    expect(hidden.slots).toBe(slots);

    const shown = showFigure(hidden);
    expect(shown.visible).toBe(true);
    expect(shown.minimized).toBe(false);
    expect(shown.silhouette).toBe(outline);
    expect(shown.slots).toBe(slots);
  });

  it('wear garment still applies slot rules (dress clears top and bottom)', () => {
    let state = wearGarment(initialFigureData(), garment('top', 'tee'));
    state = wearGarment(state, garment('bottom', 'trousers'));
    expect(state.slots.top?.id).toBe('tee');
    expect(state.slots.bottom?.id).toBe('trousers');

    state = wearGarment(state, garment('dress', 'slip'));
    expect(state.slots.dress?.id).toBe('slip');
    expect(state.slots.top).toBeNull();
    expect(state.slots.bottom).toBeNull();
    expect(state.slots.outerwear).toBeNull();

    state = wearGarment(state, garment('top', 'tee-2'));
    expect(state.slots.top?.id).toBe('tee-2');
    expect(state.slots.dress).toBeNull();
    expect(state.slots.bottom).toBeNull();
  });

  it('corner cycles through four corners', () => {
    let state = initialFigureData();
    const seen: string[] = [state.corner];
    for (let i = 0; i < CORNER_CYCLE.length; i += 1) {
      state = cycleCorner(state);
      seen.push(state.corner);
    }
    expect(seen).toEqual([...CORNER_CYCLE, CORNER_CYCLE[0]]);
    expect(new Set(CORNER_CYCLE).size).toBe(4);
  });
});
