'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  FIGURE_STORAGE_KEY,
  type OutfitSlots,
  type SavedOutfit,
  type SilhouetteResult,
  type WornGarment,
} from '@/lib/opencv/types';
import {
  cycleCorner as cycleCornerState,
  dismissFigure as dismissFigureState,
  emptySlots,
  hideFigure as hideFigureState,
  initialFigureData,
  minimizeFigure as minimizeFigureState,
  restoreFigure as restoreFigureState,
  setSilhouette as setSilhouetteState,
  showFigure as showFigureState,
  toFigureData,
  wearGarment as wearGarmentState,
  type FigureData,
} from './figure-reducer';
import { parsePersistedFigure, parsePersistedFigureJson } from './persist-figure';

export type FigurePersisted = FigureData;

type FigureState = FigurePersisted & {
  hydrated: boolean;
  setSilhouette: (silhouette: SilhouetteResult) => void;
  dismissFigure: () => void;
  hideFigure: () => void;
  showFigure: () => void;
  minimizeFigure: () => void;
  restoreFigure: () => void;
  cycleCorner: () => void;
  wearGarment: (garment: WornGarment, opts?: { autosave?: boolean }) => void;
  importAndWear: (garment: WornGarment) => void;
  removeSlot: (slot: keyof OutfitSlots) => void;
  clearOutfit: () => void;
  saveCurrentOutfit: (name?: string) => void;
  loadSavedOutfit: (id: string) => void;
  deleteSavedOutfit: (id: string) => void;
  removeFromCloset: (id: string) => void;
  replaceFromPersist: (data: unknown) => void;
};

function slotSourceUrls(slots: FigureData['slots']): string[] {
  return [slots.dress, slots.top, slots.bottom, slots.outerwear]
    .filter(Boolean)
    .map((g) => g!.sourceUrl)
    .filter((u): u is string => Boolean(u));
}

function upsertCloset(closet: WornGarment[], garment: WornGarment): WornGarment[] {
  const without = closet.filter(
    (g) => g.id !== garment.id && !(garment.sourceUrl && g.sourceUrl === garment.sourceUrl),
  );
  return [garment, ...without].slice(0, 80);
}

export const useFigureStore = create<FigureState>()(
  persist(
    (set, get) => ({
      ...initialFigureData(),
      hydrated: false,

      setSilhouette: (silhouette) => set((state) => setSilhouetteState(state, silhouette)),

      /** Clears the outline and the clothes on it. Closet and saved outfits stay. */
      dismissFigure: () => set(dismissFigureState),

      /** Hides the dock. Silhouette and slots stay so show can restore them. */
      hideFigure: () => set(hideFigureState),

      showFigure: () => set(showFigureState),

      minimizeFigure: () => set(minimizeFigureState),

      restoreFigure: () => set(restoreFigureState),

      cycleCorner: () => set(cycleCornerState),

      wearGarment: (garment, opts) => {
        const autosave = opts?.autosave ?? true;
        set((state) => {
          const next = wearGarmentState(state, garment);
          const closet = upsertCloset(state.closet, garment);
          let savedOutfits = state.savedOutfits;
          if (autosave) {
            const entry: SavedOutfit = {
              id: crypto.randomUUID(),
              name:
                garment.retailer || garment.brand
                  ? `${garment.retailer ?? garment.brand} · ${garment.name}`.slice(0, 48)
                  : garment.name.slice(0, 48),
              slots: structuredClone(next.slots),
              savedAt: new Date().toISOString(),
              sourceUrls: slotSourceUrls(next.slots),
            };
            savedOutfits = [entry, ...savedOutfits].slice(0, 40);
          }
          return {
            ...next,
            closet,
            savedOutfits,
          };
        });
      },

      importAndWear: (garment) => get().wearGarment(garment, { autosave: true }),

      removeSlot: (slot) =>
        set((state) => ({ slots: { ...state.slots, [slot]: null } })),

      clearOutfit: () => set({ slots: emptySlots() }),

      saveCurrentOutfit: (name) => {
        const { slots, savedOutfits } = get();
        const entry: SavedOutfit = {
          id: crypto.randomUUID(),
          name: name?.trim() || `Outfit ${savedOutfits.length + 1}`,
          slots: structuredClone(slots),
          savedAt: new Date().toISOString(),
          sourceUrls: slotSourceUrls(slots),
        };
        set({ savedOutfits: [entry, ...savedOutfits].slice(0, 40) });
      },

      loadSavedOutfit: (id) => {
        const found = get().savedOutfits.find((o) => o.id === id);
        if (found) set({ slots: structuredClone(found.slots), visible: true, minimized: false });
      },

      deleteSavedOutfit: (id) =>
        set((state) => ({
          savedOutfits: state.savedOutfits.filter((o) => o.id !== id),
        })),

      removeFromCloset: (id) =>
        set((state) => ({ closet: state.closet.filter((g) => g.id !== id) })),

      replaceFromPersist: (data) => {
        const parsed = parsePersistedFigure(data);
        if (!parsed) return;
        set(parsed);
      },
    }),
    {
      name: FIGURE_STORAGE_KEY,
      partialize: (state) => toFigureData(state),
      merge: (persistedState, currentState) => {
        const parsed = parsePersistedFigure(persistedState);
        if (!parsed) return currentState;
        return { ...currentState, ...parsed };
      },
      onRehydrateStorage: () => () => {
        useFigureStore.setState({ hydrated: true });
      },
    },
  ),
);

function applyExternalPersist(raw: string) {
  const data = parsePersistedFigureJson(raw);
  if (!data) return;
  useFigureStore.getState().replaceFromPersist(data);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== FIGURE_STORAGE_KEY || !event.newValue) return;
    applyExternalPersist(event.newValue);
  });

  // Same-tab sync from the Chrome extension content script
  window.addEventListener('fitmirror-sync', ((event: CustomEvent<string>) => {
    if (typeof event.detail === 'string') applyExternalPersist(event.detail);
  }) as EventListener);
}
