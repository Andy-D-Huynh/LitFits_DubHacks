'use client';

import Link from 'next/link';
import { CatalogPanel } from '@/components/studio/CatalogPanel';

export default function ShopPage() {
  return (
    <main className="fm-studio min-h-screen">
      <header className="max-w-5xl">
        <Link href="/" className="text-xs uppercase tracking-[0.14em] text-[var(--fm-muted)] underline underline-offset-2">
          FitMirror
        </Link>
        <h1 className="font-display mt-2 text-4xl tracking-tight">FitMirror shop</h1>
        <p className="mt-3 max-w-2xl rounded-sm border border-[var(--fm-line)] bg-[var(--fm-accent-soft)] px-3 py-2 text-sm">
          Sample catalog. Prices, sizes, and links are demo data, not live retailer inventory.
        </p>
      </header>
      <CatalogPanel />
    </main>
  );
}
