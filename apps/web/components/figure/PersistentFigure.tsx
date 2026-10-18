'use client';

import { useState } from 'react';
import { OutlineFigure } from '@/components/figure/OutlineFigure';
import { useFigureStore } from '@/lib/store/figure-store';
import type { FigureCorner } from '@/lib/opencv/types';

function dockClass(corner: FigureCorner, peek: boolean): string {
  return ['fm-figure-dock', `fm-figure-dock--${corner}`, peek ? 'fm-figure-dock--peek' : '']
    .filter(Boolean)
    .join(' ');
}

/** Floating side figure. Hide keeps the outline; dismiss clears it. */
export function PersistentFigure() {
  const silhouette = useFigureStore((s) => s.silhouette);
  const visible = useFigureStore((s) => s.visible);
  const minimized = useFigureStore((s) => s.minimized);
  const corner = useFigureStore((s) => s.corner);
  const slots = useFigureStore((s) => s.slots);
  const dismissFigure = useFigureStore((s) => s.dismissFigure);
  const hideFigure = useFigureStore((s) => s.hideFigure);
  const showFigure = useFigureStore((s) => s.showFigure);
  const minimizeFigure = useFigureStore((s) => s.minimizeFigure);
  const restoreFigure = useFigureStore((s) => s.restoreFigure);
  const cycleCorner = useFigureStore((s) => s.cycleCorner);
  const removeSlot = useFigureStore((s) => s.removeSlot);
  const clearOutfit = useFigureStore((s) => s.clearOutfit);
  const saveCurrentOutfit = useFigureStore((s) => s.saveCurrentOutfit);
  const savedOutfits = useFigureStore((s) => s.savedOutfits);
  const loadSavedOutfit = useFigureStore((s) => s.loadSavedOutfit);
  const deleteSavedOutfit = useFigureStore((s) => s.deleteSavedOutfit);
  const [saveName, setSaveName] = useState('');

  if (!silhouette) return null;

  if (!visible || minimized) {
    const label = visible ? 'Restore figure' : 'Show figure';
    const onClick = visible ? restoreFigure : showFigure;
    return (
      <div className={dockClass(corner, true)}>
        <button type="button" className="fm-btn-primary px-3 py-1.5 text-xs" onClick={onClick}>
          {label}
        </button>
      </div>
    );
  }

  return (
    <aside className={dockClass(corner, false)} aria-label="Your outline figure">
      <header className="mb-2">
        <p className="font-display text-lg leading-none">You</p>
        <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-[var(--fm-muted)]">
          Outline · saved here
        </p>
      </header>

      <div className="mb-2 flex flex-wrap gap-1">
        <button type="button" className="fm-btn-ghost px-2 py-1 text-[11px]" onClick={minimizeFigure}>
          Minimize
        </button>
        <button
          type="button"
          className="fm-btn-ghost px-2 py-1 text-[11px]"
          onClick={cycleCorner}
          title="Move the figure to the next corner"
        >
          Move
        </button>
        <button type="button" className="fm-btn-ghost px-2 py-1 text-[11px]" onClick={hideFigure}>
          Hide
        </button>
        <button
          type="button"
          className="fm-btn-ghost px-2 py-1 text-[11px]"
          onClick={dismissFigure}
          title="Removes the outline and the clothes on it. Saved outfits stay."
          aria-describedby="fm-dismiss-figure-hint"
        >
          Dismiss figure
        </button>
      </div>
      <p id="fm-dismiss-figure-hint" className="sr-only">
        Removes the outline and the clothes on it. Saved outfits and the closet stay.
      </p>

      <div className="fm-figure-stage">
        <OutlineFigure
          silhouette={silhouette}
          slots={slots}
          className="h-full w-full"
          instanceId="dock"
        />
      </div>
      <p className="mt-2 text-[11px] leading-snug text-[var(--fm-muted)]">
        2D preview — garment placement is approximate.
      </p>

      <div className="mt-3 space-y-2">
        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--fm-muted)]">Wearing</p>
        {!slots.dress && !slots.top && !slots.bottom && !slots.outerwear ? (
          <p className="text-xs text-[var(--fm-muted)]">
            Add products from any site — they stack as layers.
          </p>
        ) : (
          <ul className="space-y-1">
            {(
              [
                ['dress', slots.dress],
                ['top', slots.top],
                ['bottom', slots.bottom],
                ['outerwear', slots.outerwear],
              ] as const
            ).map(([slot, item]) =>
              item ? (
                <li key={slot} className="flex items-center justify-between gap-1 text-xs">
                  <span className="truncate">
                    {slot} · {item.name}
                    {item.retailer ? ` (${item.retailer})` : ''}
                  </span>
                  <button type="button" className="underline shrink-0" onClick={() => removeSlot(slot)}>
                    Remove
                  </button>
                </li>
              ) : null,
            )}
          </ul>
        )}

        <button type="button" className="fm-btn-ghost w-full text-xs" onClick={clearOutfit}>
          Clear clothes
        </button>

        <form
          className="flex gap-1 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            saveCurrentOutfit(saveName);
            setSaveName('');
          }}
        >
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Outfit name"
            className="fm-input min-w-0 flex-1 text-xs"
          />
          <button type="submit" className="fm-btn-primary px-2 text-xs">
            Save
          </button>
        </form>

        {savedOutfits.length > 0 ? (
          <div className="max-h-32 space-y-1 overflow-y-auto pt-1">
            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--fm-muted)]">
              History (auto)
            </p>
            {savedOutfits.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-1 text-xs">
                <button
                  type="button"
                  className="truncate text-left underline-offset-2 hover:underline"
                  onClick={() => loadSavedOutfit(o.id)}
                  title={o.sourceUrls?.join(', ')}
                >
                  {o.name}
                </button>
                <button
                  type="button"
                  className="shrink-0 text-[var(--fm-muted)]"
                  onClick={() => deleteSavedOutfit(o.id)}
                  aria-label={`Delete ${o.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
