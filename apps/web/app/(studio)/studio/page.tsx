'use client';

import Link from 'next/link';
import { ClosetPanel } from '@/components/studio/ClosetPanel';
import { ImportProduct } from '@/components/studio/ImportProduct';
import { OutlineFigure } from '@/components/figure/OutlineFigure';
import { SilhouetteCapture } from '@/components/figure/SilhouetteCapture';
import { useFigureStore } from '@/lib/store/figure-store';

export default function StudioPage() {
  const silhouette = useFigureStore((s) => s.silhouette);
  const visible = useFigureStore((s) => s.visible);
  const slots = useFigureStore((s) => s.slots);
  const showFigure = useFigureStore((s) => s.showFigure);
  const dismissFigure = useFigureStore((s) => s.dismissFigure);

  const hasFigure = Boolean(silhouette);

  return (
    <main className="fm-studio min-h-screen">
      <header className="fm-studio-header">
        <Link href="/" className="font-display text-3xl tracking-tight md:text-4xl">
          FitMirror
        </Link>
        <p className="mt-1 max-w-xl text-sm text-[var(--fm-muted)]">
          Your outline stays on this computer across tabs. Add the exact product from any store URL
          or the Chrome extension — outfits auto-save as you layer.
        </p>
      </header>

      <div className="fm-studio-grid">
        <div className="fm-studio-col animate-fm-rise space-y-6">
          <ImportProduct />
          <ClosetPanel />
        </div>

        <div className="fm-studio-col fm-studio-center">
          {!hasFigure ? (
            <SilhouetteCapture />
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-2xl tracking-tight">Figure viewport</h2>
                <p className="mt-1 text-sm text-[var(--fm-muted)]">
                  Exact product photos layer on your outline. Side dock persists until you dismiss.
                </p>
              </div>
              <div className="fm-viewport-stage mx-auto max-w-xs">
                <OutlineFigure
                  silhouette={silhouette!}
                  slots={slots}
                  className="h-full w-full animate-fm-rise"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {!visible ? (
                  <button type="button" className="fm-btn-primary" onClick={showFigure}>
                    Show side figure
                  </button>
                ) : null}
                <button type="button" className="fm-btn-ghost" onClick={dismissFigure}>
                  Recapture / dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
