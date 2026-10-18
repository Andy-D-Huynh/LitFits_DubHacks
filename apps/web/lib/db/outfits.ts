import {
  OutfitWithItemsSchema,
  type OutfitEntry,
  type OutfitItem,
  type OutfitWithItems,
} from '@fitmirror/shared';

export type OutfitItemRow = {
  outfit_id: string;
  garment_id: string;
  selected_size: string | null;
  slot: OutfitItem['slot'];
  position: number | null;
};

export type OutfitRow = {
  id: string;
  profile_id: string;
  name: string | null;
  created_at: string;
  outfit_items: OutfitItemRow[];
};

export function rowToOutfit(row: OutfitRow): OutfitWithItems {
  return OutfitWithItemsSchema.parse({
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    createdAt: row.created_at,
    items: [...row.outfit_items]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((i) => ({
        outfitId: i.outfit_id,
        garmentId: i.garment_id,
        selectedSize: i.selected_size,
        slot: i.slot,
        position: i.position,
      })),
  });
}

export function toEntries(items: OutfitItem[]): OutfitEntry[] {
  return items.map((i) => ({
    slot: i.slot,
    garmentId: i.garmentId,
    size: i.selectedSize,
    position: i.position ?? 0,
  }));
}

export function entryToRow(outfitId: string, e: OutfitEntry): OutfitItemRow {
  return {
    outfit_id: outfitId,
    garment_id: e.garmentId,
    selected_size: e.size,
    slot: e.slot,
    position: e.position,
  };
}
