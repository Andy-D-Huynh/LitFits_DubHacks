'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { adapterLabel, listAdapters, searchCatalog } from '@/lib/catalog/registry';
import {
  GARMENT_CATEGORIES,
  clothingProductToWornGarment,
  type CatalogQuery,
  type ClothingProduct,
} from '@/lib/figure/contracts';
import { useFigureStore } from '@/lib/store/figure-store';

const CATEGORY_FILTERS = ['all', ...GARMENT_CATEGORIES] as const;
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '28', '30', '32', '34', '36'];

function parseBound(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value;
}

function formatSamplePrice(price: NonNullable<ClothingProduct['price']>): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: price.currency }).format(
      price.amount,
    );
  } catch {
    return `${price.amount} ${price.currency}`;
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function sortSizes(sizes: string[]): string[] {
  return [...new Set(sizes)].sort((a, b) => {
    const left = SIZE_ORDER.indexOf(a);
    const right = SIZE_ORDER.indexOf(b);
    if (left === -1 && right === -1) return a.localeCompare(b);
    if (left === -1) return 1;
    if (right === -1) return -1;
    return left - right;
  });
}

export function CatalogPanel() {
  const importAndWear = useFigureStore((s) => s.importAndWear);
  const hasFigure = useFigureStore((s) => Boolean(s.silhouette));

  const [text, setText] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORY_FILTERS)[number]>('all');
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  const [products, setProducts] = useState<ClothingProduct[]>([]);
  const [facets, setFacets] = useState<ClothingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);

  const sourceLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const adapter of listAdapters()) labels.set(adapter.sourceId, adapter.label);
    return labels;
  }, []);

  const brands = useMemo(() => uniqueSorted(facets.map((product) => product.brand)), [facets]);
  const colors = useMemo(
    () => uniqueSorted(facets.flatMap((product) => (product.color ? [product.color] : []))),
    [facets],
  );
  const sizes = useMemo(
    () => sortSizes(facets.flatMap((product) => product.availableSizes ?? [])),
    [facets],
  );

  useEffect(() => {
    let active = true;
    void searchCatalog({})
      .then((rows) => {
        if (active) setFacets(rows);
      })
      .catch(() => {
        if (active) setFacets([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const query: CatalogQuery = {
      text: text.trim() || undefined,
      category,
      brand: brand || undefined,
      size: size || undefined,
      color: color || undefined,
      minPrice: parseBound(minPrice),
      maxPrice: parseBound(maxPrice),
    };

    setLoading(true);
    setError(null);
    void searchCatalog(query)
      .then((rows) => {
        if (!active) return;
        setProducts(rows);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setProducts([]);
        setError(err instanceof Error ? err.message : 'Search failed');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [text, category, brand, size, color, minPrice, maxPrice]);

  const canWear = hasFigure;

  return (
    <section className="mt-8 space-y-5">
      <div className="space-y-3">
        <input
          className="fm-input w-full text-sm"
          placeholder="Search title, brand, color, or category"
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-label="Search the sample catalog"
        />

        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className={category === value ? 'fm-chip fm-chip-active' : 'fm-chip'}
              onClick={() => setCategory(value)}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-xs text-[var(--fm-muted)]">
            Brand
            <select
              className="fm-input w-full text-sm"
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
            >
              <option value="">All brands</option>
              {brands.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-[var(--fm-muted)]">
            Size
            <select className="fm-input w-full text-sm" value={size} onChange={(event) => setSize(event.target.value)}>
              <option value="">Any size</option>
              {sizes.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-[var(--fm-muted)]">
            Color
            <select
              className="fm-input w-full text-sm"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            >
              <option value="">Any color</option>
              {colors.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-[var(--fm-muted)]">
              Min USD
              <input
                className="fm-input w-full text-sm"
                inputMode="decimal"
                min={0}
                placeholder="0"
                value={minPrice}
                onChange={(event) => setMinPrice(event.target.value)}
                aria-label="Minimum sample price"
              />
            </label>
            <label className="space-y-1 text-xs text-[var(--fm-muted)]">
              Max USD
              <input
                className="fm-input w-full text-sm"
                inputMode="decimal"
                min={0}
                placeholder="300"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
                aria-label="Maximum sample price"
              />
            </label>
          </div>
        </div>
      </div>

      {!hasFigure ? (
        <p className="text-sm text-[var(--fm-muted)]">
          Create a figure in Studio first.{' '}
          <Link href="/studio" className="underline underline-offset-2">
            Open Studio
          </Link>
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-[var(--fm-muted)]">Searching the sample catalog…</p>
      ) : null}

      {!loading && !error && products.length === 0 ? (
        <p className="rounded-sm border border-dashed border-[var(--fm-line)] px-3 py-6 text-sm text-[var(--fm-muted)]">
          Nothing in the sample catalog matches those filters.
        </p>
      ) : null}

      {!error && products.length > 0 ? (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {products.map((product) => (
            <ProductCard
              key={`${product.source}:${product.id}:${size}`}
              product={product}
              sourceLabel={sourceLabels.get(product.source) ?? adapterLabel(product.source)}
              preferredSize={size}
              canWear={canWear}
              added={addedId === `${product.source}:${product.id}`}
              onWear={(selectedSize) => {
                importAndWear(
                  clothingProductToWornGarment(product, { size: selectedSize || null }),
                );
                setAddedId(`${product.source}:${product.id}`);
              }}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ProductCard({
  product,
  sourceLabel,
  preferredSize,
  canWear,
  added,
  onWear,
}: {
  product: ClothingProduct;
  sourceLabel: string;
  preferredSize: string;
  canWear: boolean;
  added: boolean;
  onWear: (size: string) => void;
}) {
  const sizes = product.availableSizes ?? [];
  const initial = preferredSize && sizes.includes(preferredSize) ? preferredSize : (sizes[0] ?? '');
  const [selectedSize, setSelectedSize] = useState(initial);

  return (
    <li id={product.id} className="flex flex-col rounded-sm border border-[var(--fm-line)] bg-white/60 p-2">
      <div className="flex aspect-[3/4] items-center justify-center rounded-sm bg-[var(--fm-stage)] p-3">
        <img
          src={product.transparentImageUrl ?? product.imageUrl}
          alt=""
          className="h-full w-full object-contain"
        />
      </div>
      <p className="mt-2 truncate text-sm font-medium">{product.title}</p>
      <p className="truncate text-[11px] uppercase tracking-[0.1em] text-[var(--fm-muted)]">{product.brand}</p>
      <p className="mt-1 text-sm">
        {product.price ? (
          <>
            <span>{formatSamplePrice(product.price)}</span>{' '}
            <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--fm-muted)]">
              {product.price.currency} sample
            </span>
          </>
        ) : (
          <span className="text-[var(--fm-muted)]">Sample price unavailable</span>
        )}
      </p>
      <p className="text-xs text-[var(--fm-muted)]">{product.color ?? 'Color not listed'}</p>
      <p className="text-xs text-[var(--fm-muted)]">
        {sizes.length > 0 ? `Sizes ${sizes.join(', ')}` : 'Sizes not listed'}
      </p>
      <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--fm-muted)]">{sourceLabel}</p>

      {sizes.length > 0 ? (
        <label className="mt-2 text-xs text-[var(--fm-muted)]">
          Wear size
          <select
            className="fm-input mt-1 w-full text-sm"
            value={sizes.includes(selectedSize) ? selectedSize : initial}
            onChange={(event) => setSelectedSize(event.target.value)}
          >
            {sizes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <button
        type="button"
        className="fm-btn-primary mt-2 text-sm"
        disabled={!canWear}
        onClick={() => onWear(sizes.includes(selectedSize) ? selectedSize : initial)}
      >
        Add to figure
      </button>
      {added ? <p className="mt-1 text-xs text-[var(--fm-accent)]">Added to your figure.</p> : null}
    </li>
  );
}
