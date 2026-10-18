// Where the FitMirror server lives. Three ways to point the extension at it,
// highest priority first:
//   1. Runtime: chrome.storage `fitmirror-settings.apiBase` (see settings.ts),
//      e.g. from the side panel's devtools console:
//        chrome.storage.local.set({ 'fitmirror-settings': { apiBase: 'https://fitmirror-three.vercel.app' } })
//   2. Build time: VITE_API_BASE=https://… pnpm --filter @fitmirror/extension build
//   3. Default: the local dev server.

export const LOCAL_API_BASE = 'http://localhost:3000';
export const VERCEL_API_BASE = 'https://fitmirror-three.vercel.app';

/** "https://x.app/" → "https://x.app"; null for anything that isn't an http(s) origin. */
export function normalizeApiBase(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export const DEFAULT_API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE) ?? LOCAL_API_BASE;
