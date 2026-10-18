import type {
  FigureCorner,
  OutfitSlots,
  SavedOutfit,
  SilhouetteResult,
  WornGarment,
} from '../opencv/types';

/**
 * Persisted figure data. Display prefs live here so one store remains the
 * source of truth (`fitmirror-outline-figure`).
 */
export type FigureData = {
  silhouette: SilhouetteResult | null;
  visible: boolean;
  slots: OutfitSlots;
  closet: WornGarment[];
  savedOutfits: SavedOutfit[];
  minimized: boolean;
  corner: FigureCorner;
};

/** Clockwise from the default corner. */
export const CORNER_CYCLE: readonly FigureCorner[] = [
  'top-right',
  'bottom-right',
  'bottom-left',
  'top-left',
];

export const DEFAULT_CORNER: FigureCorner = 'top-right';

export function emptySlots(): OutfitSlots {
  return {
    top: null,
    bottom: null,
    outerwear: null,
    dress: null,
  };
}

export function initialFigureData(): FigureData {
  return {
    silhouette: null,
    visible: false,
    slots: emptySlots(),
    closet: [],
    savedOutfits: [],
    minimized: false,
    corner: DEFAULT_CORNER,
  };
}

/** Data fields only, so store updates do not rewrite action methods. */
export function toFigureData(state: FigureData): FigureData {
  return {
    silhouette: state.silhouette,
    visible: state.visible,
    slots: state.slots,
    closet: state.closet,
    savedOutfits: state.savedOutfits,
    minimized: state.minimized,
    corner: state.corner,
  };
}

/**
 * Hide the on-screen figure without forgetting it.
 * `visible` becomes false. Silhouette, worn slots, closet, and saved outfits stay.
 */
export function hideFigure(state: FigureData): FigureData {
  return { ...toFigureData(state), visible: false };
}

/**
 * Show the figure again after hide. No-op when there is no silhouette.
 * Expands a minimized dock (`minimized` false) so the outline is on screen.
 */
export function showFigure(state: FigureData): FigureData {
  if (!state.silhouette) return state;
  return { ...toFigureData(state), visible: true, minimized: false };
}

/**
 * Dismiss clears the figure itself: `visible` false, `silhouette` null, slots emptied.
 * Closet and saved outfits are kept (same references). Corner is kept.
 * `minimized` resets so the next capture opens expanded.
 * This is the clearing path. Hide is the non-destructive path.
 */
export function dismissFigure(state: FigureData): FigureData {
  return {
    ...toFigureData(state),
    visible: false,
    silhouette: null,
    slots: emptySlots(),
    minimized: false,
  };
}

export function minimizeFigure(state: FigureData): FigureData {
  return { ...toFigureData(state), minimized: true };
}

export function restoreFigure(state: FigureData): FigureData {
  return { ...toFigureData(state), minimized: false };
}

export function cycleCorner(state: FigureData): FigureData {
  const index = CORNER_CYCLE.indexOf(state.corner);
  const next = CORNER_CYCLE[(index + 1) % CORNER_CYCLE.length] ?? DEFAULT_CORNER;
  return { ...toFigureData(state), corner: next };
}

export function setSilhouette(state: FigureData, silhouette: SilhouetteResult): FigureData {
  return {
    ...toFigureData(state),
    silhouette,
    visible: true,
    minimized: false,
  };
}

/** Dress replaces top and bottom. Top or bottom clears a dress. Outerwear stacks. */
export function applyWear(slots: OutfitSlots, garment: WornGarment): OutfitSlots {
  const next = { ...slots };
  if (garment.category === 'dress') {
    next.dress = garment;
    next.top = null;
    next.bottom = null;
    return next;
  }
  if (garment.category === 'top') {
    next.top = garment;
    next.dress = null;
    return next;
  }
  if (garment.category === 'bottom') {
    next.bottom = garment;
    next.dress = null;
    return next;
  }
  next.outerwear = garment;
  return next;
}

export function wearGarment(state: FigureData, garment: WornGarment): FigureData {
  return {
    ...toFigureData(state),
    slots: applyWear(state.slots, garment),
    visible: state.silhouette ? true : state.visible,
  };
}
