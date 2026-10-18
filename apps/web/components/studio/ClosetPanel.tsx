'use client';

import { useState } from 'react';
import { colorForGarment } from '@/lib/garments/demo-closet';
import type { GarmentCategory, WornGarment } from '@/lib/opencv/types';
import { useFigureStore } from '@/lib/store/figure-store';

const FILTERS = ['all', 'top', 'bottom', 'outerwear', 'dress'] as const;

function thumb(g: WornGarment): string | null {
  return g.imageDataUrl || g.primaryImageUrl;
}

export function ClosetPanel() {
  const wearGarment = useFigureStore((s) => s.wearGarment);
  const closet = useFigureStore((s) => s.closet);
  const removeFromCloset = useFigureStore((s) => s.removeFromCloset);
  const hasFigure = useFigureStore((s) => Boolean(s.silhouette));
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');

  const items =
    filter === 'all' ? closet : closet.filter((g) => g.category === (filter as GarmentCategory));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-2xl tracking-tight">Your closet</h2>
        <p className="mt-1 text-sm text-[var(--fm-muted)]">
          Products you added from any site. Click to wear again.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={filter === f ? 'fm-chip fm-chip-active' : 'fm-chip'}
          >
            {f}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="rounded-sm border border-dashed border-[var(--fm-line)] px-3 py-3 text-xs text-[var(--fm-muted)]">
          Empty — paste a product URL above, use the Chrome extension on any store page, or upload a
          garment photo.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
          {items.map((g) => {
            const src = thumb(g);
            return (
              <li key={g.id} className="relative">
                <button
                  type="button"
                  onClick={() => wearGarment(g)}
                  className="group w-full text-left transition hover:-translate-y-0.5 disabled:opacity-50"
                  disabled={!hasFigure}
                >
                  <div
                    className="aspect-[3/4] overflow-hidden rounded-sm border border-[var(--fm-line)] bg-[var(--fm-stage)] bg-cover bg-center"
                    style={
                      src
                        ? { backgroundImage: `url(${src})` }
                        : {
                            background: `linear-gradient(160deg, ${colorForGarment(g.primaryColor)}, #1a1a1a)`,
                          }
                    }
                  />
                  <p className="mt-1.5 truncate text-sm font-medium">{g.name}</p>
                  <p className="truncate text-[11px] uppercase tracking-[0.1em] text-[var(--fm-muted)]">
                    {g.retailer ?? g.brand ?? g.category}
                  </p>
                </button>
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded bg-white/80 px-1.5 text-xs"
                  onClick={() => removeFromCloset(g.id)}
                  aria-label="Remove from closet"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
