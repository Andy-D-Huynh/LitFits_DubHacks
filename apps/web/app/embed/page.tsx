'use client';

import { OutlineFigure } from '@/components/figure/OutlineFigure';
import { useFigureStore } from '@/lib/store/figure-store';

/** Compact figure view for the extension side panel / iframe. */
export default function EmbedPage() {
  const silhouette = useFigureStore((s) => s.silhouette);
  const slots = useFigureStore((s) => s.slots);
  const savedOutfits = useFigureStore((s) => s.savedOutfits);
  const removeSlot = useFigureStore((s) => s.removeSlot);
  const loadSavedOutfit = useFigureStore((s) => s.loadSavedOutfit);

  return (
    <main className="min-h-screen bg-[var(--fm-paper)] p-3 text-[var(--fm-ink)]">
      <p className="font-display text-xl leading-none">FitMirror</p>
      <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[var(--fm-muted)]">
        Live figure
      </p>

      <div className="fm-figure-stage mt-3">
        {silhouette ? (
          <OutlineFigure silhouette={silhouette} slots={slots} className="h-full w-full" />
        ) : (
          <p className="flex h-full items-center justify-center px-4 text-center text-xs text-[var(--fm-muted)]">
            Capture your outline in Studio or the extension side panel.
          </p>
        )}
      </div>

      <ul className="mt-3 space-y-1 text-xs">
        {(
          [
            ['dress', slots.dress],
            ['top', slots.top],
            ['bottom', slots.bottom],
            ['outerwear', slots.outerwear],
          ] as const
        ).map(([slot, item]) =>
          item ? (
            <li key={slot} className="flex justify-between gap-2">
              <span className="truncate">
                {slot} · {item.name}
              </span>
              <button type="button" className="underline" onClick={() => removeSlot(slot)}>
                Remove
              </button>
            </li>
          ) : null,
        )}
      </ul>

      {savedOutfits.length > 0 ? (
        <div className="mt-3 max-h-40 space-y-1 overflow-y-auto">
          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--fm-muted)]">Saved</p>
          {savedOutfits.slice(0, 12).map((o) => (
            <button
              key={o.id}
              type="button"
              className="block w-full truncate text-left text-xs text-[var(--fm-accent)] underline"
              onClick={() => loadSavedOutfit(o.id)}
            >
              {o.name}
            </button>
          ))}
        </div>
      ) : null}
    </main>
  );
}
