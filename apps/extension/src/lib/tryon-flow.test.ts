import type { FitResult } from '@fitmirror/shared';
import { describe, expect, it } from 'vitest';
import { normalizeApiBase } from './config';
import {
  fitEntry,
  fitSkipReason,
  personForTryOn,
  photoFingerprint,
  readJson,
  resolveImageUrl,
  tryOnErrorMessage,
} from './tryon-flow';

const PHOTO = 'data:image/jpeg;base64,AAAABBBBCCCC';
const BOX = { x: 0.3, y: 0, w: 0.4, h: 0.2 };

describe('personForTryOn', () => {
  it('blurs the original photo with the head box found for it', () => {
    const p = personForTryOn(
      { modelImage: PHOTO, avatarImageUrl: null },
      { faceOptIn: false },
      { fingerprint: photoFingerprint(PHOTO), headBox: BOX },
    );
    expect(p).toEqual({ ok: true, modelImage: PHOTO, blurHead: true, headBox: BOX });
  });

  it('ignores a head box from a different photo (server blurs the top band)', () => {
    const p = personForTryOn(
      { modelImage: PHOTO, avatarImageUrl: null },
      { faceOptIn: false },
      { fingerprint: photoFingerprint('data:image/jpeg;base64,OTHER'), headBox: BOX },
    );
    expect(p).toMatchObject({ blurHead: true, headBox: null });
  });

  it('sends the face only when opted in', () => {
    const p = personForTryOn(
      { modelImage: PHOTO, avatarImageUrl: null },
      { faceOptIn: true },
      null,
    );
    expect(p).toMatchObject({ blurHead: false, modelImage: PHOTO });
  });

  it('builds on the latest render, which is already faceless', () => {
    const p = personForTryOn(
      { modelImage: PHOTO, avatarImageUrl: 'https://fal.media/r.png' },
      { faceOptIn: false },
      null,
    );
    expect(p).toEqual({
      ok: true,
      modelImage: 'https://fal.media/r.png',
      blurHead: false,
      headBox: null,
    });
  });

  it('asks for a photo when there is none', () => {
    expect(
      personForTryOn({ modelImage: null, avatarImageUrl: null }, { faceOptIn: false }, null),
    ).toEqual({
      ok: false,
      error: 'Add your photo in the FitMirror panel first.',
    });
  });
});

const product = { productUrl: 'https://shop.test/p/tee', productName: 'Tee' };
const result = (over: Partial<FitResult>): FitResult => ({
  garmentId: '00000000-0000-4000-8000-000000000000',
  recommendedSize: 'M',
  confidence: 'high',
  perSize: [],
  warnings: [],
  ...over,
});

describe('fit entries', () => {
  it('labels a recommendation, softening low confidence', () => {
    expect(fitEntry(product, { result: result({}) }).label).toBe('Your size: M');
    expect(fitEntry(product, { result: result({ confidence: 'low' }) }).label).toBe(
      'Your size: probably M',
    );
  });

  it('explains when no size fits', () => {
    const entry = fitEntry(product, {
      result: result({
        recommendedSize: null,
        warnings: ['No size fits well: every size is tight.'],
      }),
    });
    expect(entry).toMatchObject({ status: 'no-size', recommendedSize: null });
    expect(entry.label).toBe('No size fits well: every size is tight.');
  });

  it('says why a fit was skipped', () => {
    expect(fitSkipReason(null, { chest: 99 })).toBe('no-chart');
    expect(fitSkipReason(null, {})).toBe('no-measurements');
    expect(fitEntry(product, { status: 'no-measurements' }).label).toBe(
      'Add your measurements to see your size',
    );
  });
});

describe('responses and URLs', () => {
  it('resolves demo-mode server paths against the API base', () => {
    expect(resolveImageUrl('/tryon-placeholder.svg', 'https://fitmirror-three.vercel.app')).toBe(
      'https://fitmirror-three.vercel.app/tryon-placeholder.svg',
    );
    expect(resolveImageUrl('https://fal.media/r.png', 'http://localhost:3000')).toBe(
      'https://fal.media/r.png',
    );
  });

  it('survives non-JSON error pages', async () => {
    expect(await readJson(new Response('<html>504</html>', { status: 504 }))).toBeNull();
    expect(tryOnErrorMessage(504, null)).toBe('Try-on took too long. Try again.');
    expect(tryOnErrorMessage(404, null)).toContain('TRYON_DIRECT_ENABLED');
    expect(tryOnErrorMessage(502, { error: 'fal returned no image' })).toBe(
      'fal returned no image',
    );
  });

  it('normalizes the configured API base', () => {
    expect(normalizeApiBase('https://fitmirror-three.vercel.app/')).toBe(
      'https://fitmirror-three.vercel.app',
    );
    expect(normalizeApiBase('ftp://x')).toBeNull();
    expect(normalizeApiBase('')).toBeNull();
  });
});
