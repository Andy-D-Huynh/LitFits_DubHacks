import type {
  FigureCorner,
  OutfitSlots,
  Point,
  SavedOutfit,
  SilhouetteResult,
  WornGarment,
} from '../opencv/types';
import {
  CORNER_CYCLE,
  DEFAULT_CORNER,
  emptySlots,
  type FigureData,
} from './figure-reducer';

const SLOT_KEYS = ['top', 'bottom', 'outerwear', 'dress'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPoint(value: unknown): value is Point {
  if (!isRecord(value)) return false;
  return (
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  );
}

function isPointArray(value: unknown): value is Point[] {
  return Array.isArray(value) && value.every(isPoint);
}

function readBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readCorner(value: unknown): FigureCorner {
  if (typeof value === 'string' && (CORNER_CYCLE as readonly string[]).includes(value)) {
    return value as FigureCorner;
  }
  return DEFAULT_CORNER;
}

/**
 * A silhouette is usable only when `outline` is an array of points.
 * Any other shape is dropped so renderers never call `.map` on a bad outline.
 */
function readSilhouette(value: unknown): { silhouette: SilhouetteResult | null; invalid: boolean } {
  if (value == null) return { silhouette: null, invalid: false };
  if (!isRecord(value) || !isPointArray(value.outline)) {
    return { silhouette: null, invalid: true };
  }
  return { silhouette: value as unknown as SilhouetteResult, invalid: false };
}

function readSlots(value: unknown): OutfitSlots {
  const slots = emptySlots();
  if (!isRecord(value)) return slots;
  for (const key of SLOT_KEYS) {
    const item = value[key];
    if (item == null) {
      slots[key] = null;
    } else if (isRecord(item)) {
      slots[key] = item as unknown as WornGarment;
    } else {
      slots[key] = null;
    }
  }
  return slots;
}

function readObjects<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is T => isRecord(item));
}

function unwrapPersisted(input: unknown): unknown {
  if (!isRecord(input)) return input;
  if (isRecord(input.state)) return input.state;
  return input;
}

/**
 * Parse a persisted figure blob (raw state or Zustand `{ state, version }`).
 * Unknown fields are ignored. Missing display prefs fall back to defaults.
 * Returns null when the payload is not an object. Never throws.
 */
export function parsePersistedFigure(input: unknown): FigureData | null {
  try {
    const payload = unwrapPersisted(input);
    if (!isRecord(payload)) return null;

    const { silhouette, invalid } = readSilhouette(payload.silhouette);
    const visible = invalid ? false : readBool(payload.visible, false);

    return {
      silhouette,
      visible,
      slots: readSlots(payload.slots),
      closet: readObjects<WornGarment>(payload.closet),
      savedOutfits: readObjects<SavedOutfit>(payload.savedOutfits),
      minimized: readBool(payload.minimized, false),
      corner: readCorner(payload.corner),
    };
  } catch {
    return null;
  }
}

/** JSON entry point for storage events. Invalid JSON returns null and does not throw. */
export function parsePersistedFigureJson(raw: string): FigureData | null {
  try {
    return parsePersistedFigure(JSON.parse(raw));
  } catch {
    return null;
  }
}
