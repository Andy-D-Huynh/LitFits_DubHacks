import type { FitDirectRequest } from '@fitmirror/shared';
import { DEFAULT_API_BASE, normalizeApiBase } from './config';
import { loadFigure, saveFigure } from './storage';

// User settings the try-on and fit calls need, kept apart from the figure
// (which is mirrored into the studio's localStorage).

export const SETTINGS_KEY = 'fitmirror-settings';

export type Measurements = FitDirectRequest['measurements'];
export type FitPreference = NonNullable<FitDirectRequest['fitPreference']>;

export type Settings = {
  /** null → DEFAULT_API_BASE (build-time VITE_API_BASE or localhost). */
  apiBase: string | null;
  /** false (default): the head is blurred before the photo goes to fal. */
  faceOptIn: boolean;
  /** Body measurements in cm, keys as on /onboarding. Empty → no size shown. */
  measurements: Measurements;
  fitPreference: FitPreference;
};

const DEFAULTS: Settings = {
  apiBase: null,
  faceOptIn: false,
  measurements: {},
  fitPreference: 'regular',
};

export function normalizeSettings(raw: unknown): Settings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  const measurements: Measurements = {};
  if (s.measurements && typeof s.measurements === 'object') {
    for (const [key, value] of Object.entries(s.measurements)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0)
        (measurements as Record<string, number>)[key] = value;
    }
  }
  return {
    apiBase: normalizeApiBase(s.apiBase),
    faceOptIn: s.faceOptIn === true,
    measurements,
    fitPreference:
      s.fitPreference === 'snug' || s.fitPreference === 'loose'
        ? s.fitPreference
        : DEFAULTS.fitPreference,
  };
}

export async function loadSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(result[SETTINGS_KEY]);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...(await loadSettings()), ...patch });
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function apiBase(): Promise<string> {
  return (await loadSettings()).apiBase ?? DEFAULT_API_BASE;
}

/**
 * Turning the face on or off restarts the look from the original photo, so a
 * render made with the face visible is never reused after opting out (and the
 * other way round).
 */
export async function setFaceOptIn(faceOptIn: boolean): Promise<Settings> {
  const current = await loadSettings();
  if (current.faceOptIn === faceOptIn) return current;
  const figure = await loadFigure();
  if (figure.avatarImageUrl) await saveFigure({ ...figure, avatarImageUrl: null });
  return saveSettings({ faceOptIn });
}

export function setMeasurements(measurements: Measurements, fitPreference?: FitPreference) {
  return saveSettings(fitPreference ? { measurements, fitPreference } : { measurements });
}
