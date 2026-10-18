import type { FitEntry, PhotoMeta } from './tryon-flow';

// What the background script learns during try-on, for the side panel and the
// page dock to read (listen with chrome.storage.onChanged). Kept apart from the
// figure, which is mirrored into the studio's localStorage.

export const TRYON_STATE_KEY = 'fitmirror-tryon';

export type TryOnError = { message: string; productUrl: string | null; at: string };

export type TryOnState = {
  /** Head box MediaPipe found for the current photo (set on upload). */
  photo: PhotoMeta | null;
  /** Size answers by product URL; `lastFit` is the most recent one. */
  fits: Record<string, FitEntry>;
  lastFit: FitEntry | null;
  /** Set while a render runs, so a panel can show progress. */
  pending: { productUrl: string; since: string } | null;
  /** Last failure; cleared by the next successful try-on. */
  lastError: TryOnError | null;
  /** Last render that loaded; the figure keeps showing it after a failure. */
  lastGoodRender: string | null;
};

const EMPTY: TryOnState = {
  photo: null,
  fits: {},
  lastFit: null,
  pending: null,
  lastError: null,
  lastGoodRender: null,
};

const MAX_FITS = 50;

export async function loadTryOnState(): Promise<TryOnState> {
  const result = await chrome.storage.local.get(TRYON_STATE_KEY);
  const raw = result[TRYON_STATE_KEY] as Partial<TryOnState> | undefined;
  return { ...EMPTY, ...(raw && typeof raw === 'object' ? raw : {}) };
}

export async function updateTryOnState(patch: Partial<TryOnState>): Promise<TryOnState> {
  const next = { ...(await loadTryOnState()), ...patch };
  await chrome.storage.local.set({ [TRYON_STATE_KEY]: next });
  return next;
}

export async function recordFit(entry: FitEntry): Promise<TryOnState> {
  const { fits } = await loadTryOnState();
  const kept = Object.values({ ...fits, [entry.productUrl]: entry })
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_FITS);
  return updateTryOnState({
    fits: Object.fromEntries(kept.map((f) => [f.productUrl, f])),
    lastFit: entry,
  });
}
