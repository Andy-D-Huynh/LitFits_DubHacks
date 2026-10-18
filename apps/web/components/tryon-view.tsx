'use client';

import { useQuery } from '@tanstack/react-query';

// Try-on beside the fit panel: the model photo, and a render of the selected
// garment once it's ready (skeleton over the photo while it runs). The render
// never reflects size, so the fit verdict always comes from the fit panel.

type RenderState = {
  renderId: string | null;
  status: 'queued' | 'running' | 'done' | 'failed';
  imageUrl: string | null;
  error?: string | null;
};

class TryOnError extends Error {}

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new TryOnError(body?.error ?? `Try-on failed (${res.status})`);
  return body;
}

export function TryOnView({
  profileId,
  garmentId,
  photoUrl,
  demo,
}: {
  profileId: string;
  garmentId: string | null;
  photoUrl: string | null;
  demo: boolean;
}) {
  const query = demo ? '?demo=1' : '';

  const start = useQuery({
    queryKey: ['tryon-start', profileId, garmentId, demo],
    enabled: Boolean(garmentId),
    staleTime: Infinity,
    retry: false,
    queryFn: async () =>
      readJson<RenderState>(
        await fetch(`/api/tryon${query}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ garmentIds: [garmentId], profileId }),
        }),
      ),
  });

  const renderId = start.data?.renderId ?? null;
  const pending = start.data && start.data.status !== 'done' && start.data.status !== 'failed';
  const poll = useQuery({
    queryKey: ['tryon', renderId],
    enabled: Boolean(renderId && pending),
    retry: false,
    queryFn: async () => readJson<RenderState>(await fetch(`/api/tryon/${renderId}`)),
    refetchInterval: (q) =>
      q.state.data?.status === 'done' || q.state.data?.status === 'failed' ? false : 2000,
  });

  const render = pending ? poll.data : start.data;
  const error =
    (start.error ?? poll.error)?.message ??
    (render?.status === 'failed' ? (render.error ?? 'Render failed') : null);
  const imageUrl = render?.status === 'done' ? render.imageUrl : null;
  const running = Boolean(garmentId) && !imageUrl && !error;

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-labelledby="tryon-title">
      <h2 id="tryon-title" className="text-lg font-semibold">
        Try-on
      </h2>
      <div className="bg-muted relative aspect-[3/4] overflow-hidden rounded-md">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="You wearing the selected garment"
            className="h-full w-full object-contain"
          />
        ) : photoUrl ? (
          <img src={photoUrl} alt="Your model photo" className="h-full w-full object-contain" />
        ) : (
          <p className="text-muted-foreground p-4 text-sm">
            {demo
              ? 'Demo renders use a placeholder figure.'
              : 'Add a full-body photo on the onboarding page to see try-on.'}
          </p>
        )}
        {running && (
          <div
            className="bg-background/60 absolute inset-0 flex animate-pulse items-end justify-center p-4"
            role="status"
          >
            <span className="text-sm">Rendering…</span>
          </div>
        )}
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <p className="text-muted-foreground text-xs">
        The render shows the look, not the size. Check the fit panel for how it fits.
      </p>
    </section>
  );
}
