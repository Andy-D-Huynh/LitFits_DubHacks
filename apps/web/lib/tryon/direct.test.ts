import { describe, expect, it } from 'vitest';
import { createResultCache, directCacheKey } from './direct';

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
