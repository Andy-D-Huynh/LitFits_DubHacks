import sharp, { type Region } from 'sharp';
import { describe, expect, it } from 'vitest';
import { PhotoError } from '../photos/process';
import { createResultCache, directCacheKey, facelessDataUrl } from './direct';

describe('direct try-on cache', () => {
  it('keys on both images and the category', () => {
    const key = directCacheKey('m', 'g', 'tops');
    expect(directCacheKey('m', 'g', 'tops')).toBe(key);
    expect(directCacheKey('m', 'g', 'bottoms')).not.toBe(key);
    expect(directCacheKey('m', 'g2', 'tops')).not.toBe(key);
  });

  it('evicts the oldest entry when full', () => {
    const cache = createResultCache(2);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
  });
});

// Busy detail everywhere so a blurred region shows as a drop in variation.
async function detailedJpeg(width = 600, height = 900) {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 37 + (i >> 7) * 91) % 256;
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg()
    .toBuffer();
}

async function stdevOf(jpeg: Buffer, region: Region) {
  const crop = await sharp(jpeg).extract(region).toBuffer();
  const { channels } = await sharp(crop).stats();
  return channels[0]!.stdev;
}

describe('facelessDataUrl', () => {
  it('blurs the head box of an inline photo and leaves the body alone', async () => {
    const input = await detailedJpeg();
    const url = await facelessDataUrl(`data:image/jpeg;base64,${input.toString('base64')}`, {
      x: 0.3,
      y: 0,
      w: 0.4,
      h: 0.2,
    });
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true);
    const out = Buffer.from(url.split(',')[1]!, 'base64');
    const head = { left: 200, top: 10, width: 200, height: 150 };
    const body = { left: 200, top: 500, width: 200, height: 150 };
    expect(await stdevOf(out, head)).toBeLessThan((await stdevOf(input, head)) / 3);
    expect(await stdevOf(out, body)).toBeGreaterThan((await stdevOf(input, body)) * 0.8);
  });

  it('blurs the top band when there is no head box', async () => {
    const input = await detailedJpeg();
    const url = await facelessDataUrl(`data:image/jpeg;base64,${input.toString('base64')}`, null);
    const out = Buffer.from(url.split(',')[1]!, 'base64');
    const band = { left: 0, top: 10, width: 600, height: 150 };
    expect(await stdevOf(out, band)).toBeLessThan((await stdevOf(input, band)) / 3);
  });

  it('rejects anything but an image data URL', async () => {
    await expect(facelessDataUrl('https://fal.test/render.png', null)).rejects.toBeInstanceOf(
      PhotoError,
    );
  });
});
