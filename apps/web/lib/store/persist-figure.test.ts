import { describe, expect, it } from 'vitest';
import { parsePersistedFigure, parsePersistedFigureJson } from './persist-figure';

describe('persist figure', () => {
  it('drops a silhouette with a broken outline and does not throw', () => {
    const raw = JSON.stringify({
      state: {
        visible: true,
        silhouette: { outline: { x: 0, y: 0 }, width: 10, height: 40, createdAt: 't' },
        closet: [{ id: 'keep-closet' }],
        savedOutfits: [{ id: 'keep-outfit' }],
        mystery: { ignored: true },
      },
      version: 0,
    });

    expect(() => parsePersistedFigureJson(raw)).not.toThrow();
    const parsed = parsePersistedFigureJson(raw);

    expect(parsed).not.toBeNull();
    expect(parsed?.silhouette).toBeNull();
    expect(parsed?.visible).toBe(false);
    expect(parsed?.closet).toEqual([{ id: 'keep-closet' }]);
    expect(parsed?.savedOutfits).toEqual([{ id: 'keep-outfit' }]);
    expect(parsed?.minimized).toBe(false);
    expect(parsed?.corner).toBe('top-right');
    expect(parsed && 'mystery' in parsed).toBe(false);
  });

  it('rejects an outline array that contains a non-point', () => {
    const parsed = parsePersistedFigure({
      visible: true,
      silhouette: { outline: [{ x: 0, y: 0 }, { x: 'nope', y: 1 }], width: 10, height: 20 },
    });
    expect(parsed?.silhouette).toBeNull();
    expect(parsed?.visible).toBe(false);
  });

  it('keeps a valid outline and defaults missing display prefs', () => {
    const outline = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.5, y: 1 },
    ];
    const parsed = parsePersistedFigureJson(
      JSON.stringify({
        silhouette: { outline, width: 100, height: 200, createdAt: 't', extraSil: true },
        visible: true,
        futureField: 'ignore-me',
      }),
    );

    expect(parsed?.silhouette?.outline).toEqual(outline);
    expect(parsed?.visible).toBe(true);
    expect(parsed?.minimized).toBe(false);
    expect(parsed?.corner).toBe('top-right');
    expect(parsed && 'futureField' in parsed).toBe(false);
  });

  it('reads display prefs and ignores invalid ones', () => {
    const parsed = parsePersistedFigure({
      silhouette: null,
      visible: false,
      minimized: true,
      corner: 'bottom-left',
    });
    expect(parsed?.minimized).toBe(true);
    expect(parsed?.corner).toBe('bottom-left');

    const invalid = parsePersistedFigure({ minimized: 'yes', corner: 'center' });
    expect(invalid?.minimized).toBe(false);
    expect(invalid?.corner).toBe('top-right');
  });

  it('does not throw on invalid JSON', () => {
    expect(() => parsePersistedFigureJson('not json')).not.toThrow();
    expect(parsePersistedFigureJson('not json')).toBeNull();
    expect(parsePersistedFigure(null)).toBeNull();
    expect(parsePersistedFigure('silhouette')).toBeNull();
  });
});
