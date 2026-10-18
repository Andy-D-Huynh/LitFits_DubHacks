'use client';

import { useState } from 'react';
import { guessCategory, retailerFromUrl } from '@/lib/garments/categorize';
import { fileToImageDataUrl } from '@/lib/images/normalize-upload';
import type { GarmentCategory, WornGarment } from '@/lib/opencv/types';
import { useFigureStore } from '@/lib/store/figure-store';

const CATEGORIES: GarmentCategory[] = ['top', 'bottom', 'outerwear', 'dress'];

export function ImportProduct() {
  const importAndWear = useFigureStore((s) => s.importAndWear);
  const hasFigure = useFigureStore((s) => Boolean(s.silhouette));
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState<GarmentCategory>('top');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);

  async function importFromUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    setLastName(null);
    try {
      const res = await fetch('/api/products/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await res.json()) as {
        error?: string;
        name?: string;
        brand?: string | null;
        imageUrl?: string | null;
        imageDataUrl?: string | null;
        category?: GarmentCategory;
        sourceUrl?: string;
        retailer?: string | null;
      };
      if (!res.ok) throw new Error(data.error || 'Import failed');

      const cat = category || data.category || 'top';
      const garment: WornGarment = {
        id: crypto.randomUUID(),
        name: data.name || 'Product',
        category: cat,
        primaryColor: null,
        primaryImageUrl: data.imageUrl ?? null,
        imageDataUrl: data.imageDataUrl ?? null,
        brand: data.brand ?? null,
        sourceUrl: data.sourceUrl ?? url.trim(),
        retailer: data.retailer ?? retailerFromUrl(url.trim()),
        addedAt: new Date().toISOString(),
      };
      if (data.category) setCategory(data.category);
      importAndWear(garment);
      setLastName(garment.name);
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  async function importFromImage(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await fileToImageDataUrl(file);
      const name = file.name.replace(/\.[^.]+$/, '') || 'Uploaded garment';
      const garment: WornGarment = {
        id: crypto.randomUUID(),
        name,
        category,
        primaryColor: null,
        primaryImageUrl: null,
        imageDataUrl: dataUrl,
        brand: null,
        sourceUrl: null,
        retailer: 'upload',
        addedAt: new Date().toISOString(),
      };
      importAndWear(garment);
      setLastName(garment.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-sm border border-[var(--fm-line)] bg-white/50 p-4">
      <div>
        <h2 className="font-display text-xl tracking-tight">Add from any website</h2>
        <p className="mt-1 text-xs text-[var(--fm-muted)]">
          Paste a Uniqlo / Nike / Zara / any product URL. We pull the exact product image and layer
          it on your outline. Or upload a product photo.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={category === c ? 'fm-chip fm-chip-active' : 'fm-chip'}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => void importFromUrl(e)}>
        <input
          className="fm-input min-w-0 flex-1 text-sm"
          placeholder="https://www.uniqlo.com/.../product..."
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (e.target.value) setCategory(guessCategory(e.target.value));
          }}
        />
        <button type="submit" className="fm-btn-primary text-sm" disabled={busy || !hasFigure}>
          {busy ? 'Adding…' : 'Add to figure'}
        </button>
      </form>

      <label className="fm-btn-ghost inline-flex cursor-pointer text-sm">
        Upload product image
        <input
          type="file"
          accept="image/*,.heic,.heif"
          className="sr-only"
          onChange={(e) => void importFromImage(e.target.files?.[0])}
        />
      </label>

      {!hasFigure ? (
        <p className="text-xs text-[var(--fm-muted)]">Create your outline first.</p>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {lastName ? (
        <p className="text-sm text-[var(--fm-accent)]">Added “{lastName}” — outfit auto-saved.</p>
      ) : null}
    </section>
  );
}
