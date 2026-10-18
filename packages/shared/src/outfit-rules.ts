import { problemPhrase } from './fit-engine';
import type { Category, FitResult, Slot } from './types';

// Pure outfit slot rules (docs/outfit-editing.md, flow E). Shared by the API
// and the client outfit store so optimistic updates match the server exactly.

export type OutfitEntry = { slot: Slot; garmentId: string; size: string | null; position: number };
export type NewItem = { garmentId: string; category: Category; size: string | null };

// Try-on layer order: dress or top, then bottom, then outerwear.
export const LAYER_POSITION: Record<Slot, number> = { dress: 0, top: 0, bottom: 1, outerwear: 2 };

const SLOT_ORDER: readonly Slot[] = ['dress', 'top', 'bottom', 'outerwear'];

function sorted(items: OutfitEntry[]): OutfitEntry[] {
  return [...items].sort(
    (a, b) => a.position - b.position || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
  );
}

// Slots an item in `slot` displaces: a dress fills top and bottom.
function displaced(slot: Slot): Slot[] {
  if (slot === 'dress') return ['dress', 'top', 'bottom'];
  if (slot === 'top' || slot === 'bottom') return [slot, 'dress'];
  return [slot];
}

export type OutfitChange = { items: OutfitEntry[]; removed: OutfitEntry[] };

// Add: places the item; anything it displaces is returned in `removed` for Undo.
export function addItem(items: OutfitEntry[], item: NewItem): OutfitChange {
  const slot: Slot = item.category;
  const clash = displaced(slot);
  const removed = items.filter((i) => clash.includes(i.slot));
  const entry: OutfitEntry = {
    slot,
    garmentId: item.garmentId,
    size: item.size,
    position: LAYER_POSITION[slot],
  };
  return { items: sorted([...items.filter((i) => !clash.includes(i.slot)), entry]), removed };
}

export type SwapError = 'slot_empty' | 'category_mismatch';

// Swap or change size in place: same slot, same layer position.
export function swapItem(
  items: OutfitEntry[],
  slot: Slot,
  item: NewItem,
): OutfitChange | { error: SwapError } {
  const current = items.find((i) => i.slot === slot);
  if (!current) return { error: 'slot_empty' };
  if (item.category !== slot) return { error: 'category_mismatch' };
  const entry: OutfitEntry = { ...current, garmentId: item.garmentId, size: item.size };
  return { items: items.map((i) => (i.slot === slot ? entry : i)), removed: [current] };
}

// Remove empties the slot. A worn dress fills top and bottom, so removing
// either of those removes the dress.
export function removeItem(items: OutfitEntry[], slot: Slot): OutfitChange {
  const target =
    items.find((i) => i.slot === slot) ??
    (slot === 'top' || slot === 'bottom' ? items.find((i) => i.slot === 'dress') : undefined);
  if (!target) return { items, removed: [] };
  return { items: items.filter((i) => i !== target), removed: [target] };
}

const SLOT_NAME: Record<Slot, string> = {
  top: 'top',
  bottom: 'bottom',
  outerwear: 'outerwear',
  dress: 'dress',
};

// One outfit-level line for the fit panel, e.g. "Top fits, bottom is tight at the waist."
export function outfitSummary(
  items: OutfitEntry[],
  fits: Partial<Record<Slot, FitResult>>,
): string {
  if (items.length === 0) return 'Nothing worn yet.';
  const parts = sorted(items).map((item) => {
    const name = SLOT_NAME[item.slot];
    const size = fits[item.slot]?.perSize.find((s) => s.size === item.size);
    if (!item.size || !size) return `${name} has no size checked`;
    if (size.overall === 'good') return `${name} fits`;
    const issues = size.dims
      .filter((d) => d.verdict === 'tight' || d.verdict === 'loose')
      .map((d) => problemPhrase({ dim: d.dim, verdict: d.verdict }));
    if (issues.length === 0) return `${name} is ${size.overall}`;
    return `${name} is ${issues.join(' and ')}`;
  });
  const line = parts.join(', ');
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
}
