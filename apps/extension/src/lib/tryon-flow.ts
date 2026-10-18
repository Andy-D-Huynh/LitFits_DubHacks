import type { FitDirectGarment, FitResult, NormBox } from '@fitmirror/shared';
import type { Measurements, Settings } from './settings';
import type { FigurePersist } from './types';

// Pure decisions behind the background script's try-on and fit calls, kept
// free of chrome.* so they can be unit-tested.

/** Head box found for a given photo; `fingerprint` ties it to that photo. */
export type PhotoMeta = { fingerprint: string; headBox: NormBox | null };

/** Cheap identity for a data URL photo (no hashing of megabytes in the worker). */
export function photoFingerprint(dataUrl: string): string {
  return `${dataUrl.length}:${dataUrl.slice(-64)}`;
}

export type PersonForTryOn =
  | { ok: true; modelImage: string; blurHead: boolean; headBox: NormBox | null }
  | { ok: false; error: string };

/**
 * Which image goes to fal as the person. Later try-ons build on the latest
 * render; the first starts from the original photo, which is sent with
 * blurHead (and the head box, if MediaPipe found one for this exact photo)
 * unless the user opted in to showing their face. Renders made from a blurred
 * photo are already faceless, and setFaceOptIn restarts the chain on a change.
 */
export function personForTryOn(
  figure: Pick<FigurePersist, 'modelImage' | 'avatarImageUrl'>,
  settings: Pick<Settings, 'faceOptIn'>,
  photo: PhotoMeta | null,
): PersonForTryOn {
  if (figure.avatarImageUrl)
    return { ok: true, modelImage: figure.avatarImageUrl, blurHead: false, headBox: null };
  if (!figure.modelImage)
    return { ok: false, error: 'Add your photo in the FitMirror panel first.' };
  if (settings.faceOptIn)
    return { ok: true, modelImage: figure.modelImage, blurHead: false, headBox: null };
  const matches = photo?.fingerprint === photoFingerprint(figure.modelImage);
  return {
    ok: true,
    modelImage: figure.modelImage,
    blurHead: true,
    headBox: matches ? photo!.headBox : null, // null → the server blurs the top band
  };
}

export type FitStatus = 'ok' | 'no-size' | 'no-chart' | 'no-measurements' | 'error';

/** One product's size answer, ready for the side panel to show as-is. */
export type FitEntry = {
  productUrl: string;
  productName: string;
  at: string;
  status: FitStatus;
  /** Short line for the UI: "Your size: M", "No size fits well", … */
  label: string;
  recommendedSize: string | null;
  confidence: FitResult['confidence'] | null;
  /** Full engine output (per-size verdicts and explanation notes); null unless the call ran. */
  result: FitResult | null;
};

export function hasMeasurements(m: Measurements): boolean {
  return Object.keys(m).length > 0;
}

/** Why there is no fit call to make, or null when there is one. */
export function fitSkipReason(
  garment: FitDirectGarment | null | undefined,
  measurements: Measurements,
): Exclude<FitStatus, 'ok' | 'no-size' | 'error'> | null {
  if (!hasMeasurements(measurements)) return 'no-measurements';
  if (!garment) return 'no-chart';
  return null;
}

const SKIP_LABEL: Record<'no-chart' | 'no-measurements' | 'error', string> = {
  'no-chart': 'No size chart found on this page',
  'no-measurements': 'Add your measurements to see your size',
  error: 'Size check unavailable',
};

export function fitEntry(
  product: { productUrl: string; productName: string },
  outcome: { result: FitResult } | { status: 'no-chart' | 'no-measurements' | 'error' },
  now = new Date(),
): FitEntry {
  const base = { ...product, at: now.toISOString() };
  if ('status' in outcome)
    return {
      ...base,
      status: outcome.status,
      label: SKIP_LABEL[outcome.status],
      recommendedSize: null,
      confidence: null,
      result: null,
    };
  const { result } = outcome;
  const size = result.recommendedSize;
  return {
    ...base,
    status: size ? 'ok' : 'no-size',
    label: size
      ? result.confidence === 'low'
        ? `Your size: probably ${size}`
        : `Your size: ${size}`
      : (result.warnings[0] ?? 'No size fits well'),
    recommendedSize: size,
    confidence: result.confidence,
    result,
  };
}

/** Demo-mode renders come back as server paths ("/tryon-placeholder.svg"). */
export function resolveImageUrl(url: string, base: string): string {
  try {
    return new URL(url, `${base}/`).toString();
  } catch {
    return url;
  }
}

/** Reads a JSON body without throwing on HTML error pages (timeouts, proxies). */
export async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const data = (await res.json()) as unknown;
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A message a person can act on, for any failed try-on response. */
export function tryOnErrorMessage(status: number, data: Record<string, unknown> | null): string {
  if (typeof data?.error === 'string' && data.error) return data.error;
  if (status === 404) return 'Try-on is turned off on this server (TRYON_DIRECT_ENABLED).';
  if (status === 429) return 'Try-on limit reached; try again later.';
  if (status === 504 || status === 408) return 'Try-on took too long. Try again.';
  return `Try-on failed (${status}).`;
}
