import { describe, expect, it } from 'vitest';
import { assessQuality } from './quality';

const image = { imageWidth: 200, imageHeight: 400 };

describe('assessQuality', () => {
  it('does not throw and fails an empty mask with zero bounds', () => {
    const input = {
      ...image,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      personArea: 0,
      secondBlobArea: 0,
      usedFallback: false,
      method: 'canvas' as const,
    };
    let status = '';
    expect(() => {
      status = assessQuality(input).status;
    }).not.toThrow();
    const quality = assessQuality(input);
    expect(status).toBe('failed');
    expect(quality.status).toBe('failed');
    expect(quality.usedFallback).toBe(true);
    expect(quality.messages.length).toBeGreaterThan(0);
    expect(quality.messages[0]?.length).toBeGreaterThan(10);

    const missing = assessQuality({
      ...image,
      bounds: null,
      personArea: 0,
      secondBlobArea: 0,
      usedFallback: false,
      method: 'rejected',
    });
    expect(missing.status).toBe('failed');
    expect(missing.usedFallback).toBe(true);
  });

  it('fails a synthetic stand-in even when the box looks large', () => {
    const quality = assessQuality({
      ...image,
      bounds: { x: 50, y: 20, width: 100, height: 360 },
      personArea: 100 * 360,
      secondBlobArea: 0,
      usedFallback: true,
      method: 'rejected',
    });
    expect(quality.status).toBe('failed');
    expect(quality.usedFallback).toBe(true);
    expect(quality.messages[0]?.toLowerCase()).toContain('outline');
  });

  it('marks a second large blob as more than one person', () => {
    const quality = assessQuality({
      ...image,
      bounds: { x: 20, y: 30, width: 70, height: 320 },
      personArea: 70 * 320,
      secondBlobArea: 70 * 320 * 0.5,
      usedFallback: false,
      method: 'opencv',
    });
    expect(quality.status).toBe('low');
    expect(quality.usedFallback).toBe(false);
    expect(quality.messages.join(' ').toLowerCase()).toContain('one person');
  });

  it('asks for a full-body photo when the person is short in the frame', () => {
    const quality = assessQuality({
      ...image,
      bounds: { x: 40, y: 40, width: 80, height: 180 },
      personArea: 80 * 180,
      secondBlobArea: 0,
      usedFallback: false,
      method: 'canvas',
    });
    expect(quality.status).toBe('low');
    expect(quality.messages.some((message) => message.includes('whole body in frame'))).toBe(true);
  });

  it('accepts one centered person who does not touch the frame', () => {
    const quality = assessQuality({
      ...image,
      bounds: { x: 40, y: 20, width: 80, height: 320 },
      personArea: 80 * 320,
      secondBlobArea: 100,
      usedFallback: false,
      method: 'opencv',
    });
    expect(quality.status).toBe('ok');
    expect(quality.messages).toEqual([]);
    expect(quality.usedFallback).toBe(false);
  });
});
