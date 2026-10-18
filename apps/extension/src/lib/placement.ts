import { trackForCategory } from './categorize';
import type { GarmentTrack, OutfitSlots, WornGarment } from './types';

export type Zone = { x: number; y: number; w: number; h: number };

const ZONES: Record<WornGarment['category'], Zone> = {
  bottom: { x: 0.2, y: 0.5, w: 0.6, h: 0.4 },
  footwear: { x: 0.18, y: 0.82, w: 0.64, h: 0.16 },
  dress: { x: 0.16, y: 0.16, w: 0.68, h: 0.62 },
  top: { x: 0.16, y: 0.18, w: 0.68, h: 0.34 },
  outerwear: { x: 0.1, y: 0.14, w: 0.8, h: 0.46 },
  accessory: { x: 0.28, y: 0.02, w: 0.44, h: 0.16 },
};

export type PlacedGarment = {
  garment: WornGarment;
  zone: Zone;
  track: GarmentTrack;
};

/**
 * Physical dressing order: bottoms, then shoes, then inner top or dress, then jacket, then hat/bag.
 * Each garment keeps the cutout already stored on it, so swapping shoes does not refetch the jacket.
 */
export function placeOutfit(slots: OutfitSlots): PlacedGarment[] {
  const order: Array<WornGarment | null> = [
    slots.bottom,
    slots.footwear,
    slots.dress ?? slots.top,
    slots.outerwear,
    slots.accessory,
  ];
  const placed: PlacedGarment[] = [];
  for (const garment of order) {
    if (!garment) continue;
    placed.push({
      garment,
      zone: ZONES[garment.category],
      track: garment.track ?? trackForCategory(garment.category),
    });
  }
  return placed;
}
