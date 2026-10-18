import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { PhotoError, blurRegion, boxToPixels, processModelPhoto } from './process';

// A 600×900 photo with high-frequency detail everywhere, plus EXIF and GPS.
async function photoWithExif(width = 600, height = 900): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 37 + (i >> 7) * 91) % 256;
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg()
    .withMetadata({
      exif: { IFD0: { Copyright: 'secret', Artist: 'me' }, IFD3: { GPSLatitudeRef: 'N' } },
    })
    .toBuffer();
}

describe('processModelPhoto', () => {
  it('strips EXIF and GPS metadata', async () => {
    const input = await photoWithExif();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const out = await processModelPhoto(input);
    const meta = await sharp(out.jpeg).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.format).toBe('jpeg');
    expect([out.width, out.height]).toEqual([600, 900]);
  });

  it('applies EXIF orientation before stripping it', async () => {
    const raw = Buffer.alloc(600 * 900 * 3, 128);
    const rotated = await sharp(raw, { raw: { width: 600, height: 900, channels: 3 } })
      .jpeg()
      .withMetadata({ orientation: 6 }) // stored sideways, displayed upright
      .toBuffer();
    const out = await processModelPhoto(rotated);
    expect([out.width, out.height]).toEqual([900, 600]);
    expect((await sharp(out.jpeg).metadata()).orientation).toBeUndefined();
  });

  it('rejects photos that are too small or not images', async () => {
    await expect(processModelPhoto(await photoWithExif(200, 300))).rejects.toBeInstanceOf(
      PhotoError,
    );
    await expect(processModelPhoto(Buffer.from('not an image'))).rejects.toThrow();
  });
});

describe('blurRegion', () => {
  // Detail is measured as pixel standard deviation: blurring the head should
  // wipe out its detail while the body keeps its own.
  it('removes detail inside the head box and leaves the rest alone', async () => {
    const photo = await processModelPhoto(await photoWithExif());
    const box = { x: 0.3, y: 0, w: 0.4, h: 0.2 };
    const blurred = await blurRegion(photo, box);
    const r = boxToPixels(box, photo.width, photo.height);
    const head = { left: r.left + 8, top: 8, width: r.width - 16, height: r.height - 16 };
    const body = { left: 0, top: Math.round(photo.height / 2), width: photo.width, height: 200 };
    // Extract to a buffer first: a chained .stats() ignores .extract().
    const stdev = async (img: Buffer, region: typeof head) =>
      (await sharp(await sharp(img).extract(region).toBuffer()).stats()).channels[0]!.stdev;

    expect(await stdev(blurred, head)).toBeLessThan((await stdev(photo.jpeg, head)) * 0.25);
    const bodyBefore = await stdev(photo.jpeg, body);
    expect(Math.abs((await stdev(blurred, body)) - bodyBefore)).toBeLessThan(bodyBefore * 0.1);
  });

  it('converts normalized boxes to clamped pixels', () => {
    expect(boxToPixels({ x: 0.9, y: 0.9, w: 0.2, h: 0.2 }, 100, 200)).toEqual({
      left: 90,
      top: 180,
      width: 10,
      height: 20,
    });
  });
});
