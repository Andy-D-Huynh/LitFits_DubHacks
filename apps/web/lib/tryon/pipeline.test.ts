import type { Garment } from '@fitmirror/shared';
import { describe, expect, it } from 'vitest';
import type { TryOnInput, TryOnProvider } from '../providers/tryon/types';
import {
  chainKeys,
  checkRenderBudget,
  RENDER_LIMIT_WINDOW_MS,
  planRender,
  processRender,
  requestRender,
  STALE_RENDER_MS,
  toLayers,
  type ImageStore,
  type PipelineDeps,
  type RenderRow,
  type RenderStore,
} from './pipeline';

const PROFILE = '00000000-0000-4000-8000-0000000000d1';

function garment(id: string, category: Garment['category'], image?: string): Garment {
  return {
    id: `00000000-0000-4000-8000-00000000000${id}`,
    sourceUrl: null,
    retailer: null,
    brand: 'Brand',
    name: `Item ${id}`,
    category,
    imageUrls: image ? [image] : [],
    primaryImageUrl: image ?? null,
    primaryColor: null,
    priceCents: null,
    currency: null,
    fitType: 'regular',
    stretch: 'none',
    chartType: null,
    measurementBasis: null,
    sizeChart: null,
    extractionMethod: 'fixture',
    extractionConfidence: null,
    isPlaceholder: true,
    createdAt: '2026-10-17T00:00:00+00:00',
  };
}

const tee = garment('1', 'top', 'https://img.test/tee.jpg');
const chino = garment('5', 'bottom', 'https://img.test/chino.jpg');
const jogger = garment('6', 'bottom', 'https://img.test/jogger.jpg');
const jacket = garment('7', 'outerwear', 'https://img.test/jacket.jpg');

class MemoryStore implements RenderStore {
  rows: RenderRow[] = [];
  async findByKey(k: string) {
    return this.rows.find((r) => r.cacheKey === k) ?? null;
  }
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async insert(row: Omit<RenderRow, 'id' | 'createdAt'>) {
    const full = { ...row, id: `r${this.rows.length + 1}`, createdAt: new Date().toISOString() };
    this.rows.push(full);
    return full;
  }
  async update(id: string, patch: Partial<RenderRow>) {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
  }
  async countSince(profileId: string, provider: string, sinceIso: string) {
    return this.rows.filter(
      (r) => r.profileId === profileId && r.provider === provider && r.createdAt >= sinceIso,
    ).length;
  }
}

class CountingProvider implements TryOnProvider {
  readonly name = 'test';
  calls: TryOnInput[] = [];
  failOn?: string;
  async render(input: TryOnInput) {
    if (input.garmentImageUrl === this.failOn) throw new Error('provider down');
    this.calls.push(input);
    return { imageUrl: `out:${this.calls.length}` };
  }
}

const images: ImageStore = {
  save: async (_p, key) => `renders/${key}.jpg`,
  urlFor: async (path) => `https://signed.test/${path}`,
};

function setup() {
  const store = new MemoryStore();
  const provider = new CountingProvider();
  const deps: PipelineDeps = { store, images, provider };
  const run = async (garments: Garment[]) => {
    const plan = planRender(
      PROFILE,
      `profile:${PROFILE}`,
      'https://person.test/me.jpg',
      garments,
      provider.name,
    );
    const req = await requestRender(deps, plan);
    if (req.needsProcessing) await processRender(deps, plan, req.row.id);
    return { plan, req, row: (await store.findById(req.row.id))! };
  };
  return { store, provider, deps, run };
}

describe('layers and cache keys', () => {
  it('orders layers dress/top, bottom, outerwear and maps categories', () => {
    expect(toLayers([jacket, chino, tee]).map((l) => [l.garmentId.slice(-1), l.category])).toEqual([
      ['1', 'upper_body'],
      ['5', 'lower_body'],
      ['7', 'upper_body'],
    ]);
  });

  it('chains keys so an edit changes only that layer and above', () => {
    const a = chainKeys('p', toLayers([tee, chino, jacket]), 'mock');
    const b = chainKeys('p', toLayers([tee, jogger, jacket]), 'mock');
    expect(b[0]).toBe(a[0]);
    expect(b[1]).not.toBe(a[1]);
    expect(b[2]).not.toBe(a[2]);
  });

  it('is deterministic and depends on the provider and person', () => {
    const layers = toLayers([tee]);
    expect(chainKeys('p', layers, 'mock')).toEqual(chainKeys('p', layers, 'mock'));
    expect(chainKeys('p', layers, 'replicate')).not.toEqual(chainKeys('p', layers, 'mock'));
    expect(chainKeys('q', layers, 'mock')).not.toEqual(chainKeys('p', layers, 'mock'));
  });
});

describe('render queue', () => {
  it('renders each layer, feeding the previous output in as the person image', async () => {
    const { provider, run } = setup();
    const { row } = await run([tee, chino]);
    expect(row.status).toBe('done');
    expect(provider.calls.map((c) => c.personImageUrl)).toEqual([
      'https://person.test/me.jpg',
      expect.stringMatching(/^https:\/\/signed\.test\/renders\//),
    ]);
  });

  it('a repeat request is a cache hit with no provider calls', async () => {
    const { provider, run } = setup();
    await run([tee, chino]);
    const again = await run([tee, chino]);
    expect(again.req.needsProcessing).toBe(false);
    expect(provider.calls).toHaveLength(2);
  });

  it('removing the top-most layer is a cache hit', async () => {
    const { provider, run } = setup();
    await run([tee, chino, jacket]);
    const without = await run([tee, chino]);
    expect(without.row.status).toBe('done');
    expect(provider.calls).toHaveLength(3);
  });

  it('swapping a layer re-renders only that layer and the ones above it', async () => {
    const { provider, run } = setup();
    await run([tee, chino, jacket]);
    await run([tee, jogger, jacket]);
    expect(provider.calls.map((c) => c.garmentImageUrl)).toEqual([
      'https://img.test/tee.jpg',
      'https://img.test/chino.jpg',
      'https://img.test/jacket.jpg',
      'https://img.test/jogger.jpg',
      'https://img.test/jacket.jpg',
    ]);
  });

  it('marks the render failed when the provider throws, and requeues it next time', async () => {
    const { provider, run } = setup();
    provider.failOn = 'https://img.test/chino.jpg';
    const failed = await run([tee, chino]);
    expect(failed.row).toMatchObject({ status: 'failed', error: 'provider down' });
    provider.failOn = undefined;
    const retry = await run([tee, chino]);
    expect(retry.req.needsProcessing).toBe(true);
    expect(retry.row.status).toBe('done');
    // The tee layer succeeded the first time and is reused.
    expect(provider.calls.filter((c) => c.garmentImageUrl.endsWith('tee.jpg'))).toHaveLength(1);
  });

  it('reuses an in-flight render but requeues a stale one', async () => {
    const { store, deps, provider } = setup();
    const plan = planRender(PROFILE, 'p', 'https://person.test/me.jpg', [tee], provider.name);
    const first = await requestRender(deps, plan);
    expect((await requestRender(deps, plan)).needsProcessing).toBe(false);
    const later = new Date(Date.now() + STALE_RENDER_MS + 1000);
    const stale = await requestRender({ ...deps, now: () => later }, plan);
    expect(stale.needsProcessing).toBe(true);
    expect(store.rows).toHaveLength(1);
    expect(stale.row.id).toBe(first.row.id);
  });
});

describe('render budget', () => {
  it('blocks a request that would exceed the per-profile limit', async () => {
    const { deps, run, provider } = setup();
    await run([tee, chino]); // 2 provider renders recorded for the profile
    const plan = planRender(
      PROFILE,
      `profile:${PROFILE}`,
      'https://person.test/me.jpg',
      [tee, jogger, jacket],
      provider.name,
    );
    // tee is cached; jogger and jacket need renders: 2 used + 2 needed.
    expect(await checkRenderBudget(deps, plan, 4)).toEqual({ ok: true });
    expect(await checkRenderBudget(deps, plan, 3)).toEqual({
      ok: false,
      used: 2,
      needed: 2,
      limit: 3,
    });
  });

  it('never limits a fully cached outfit or the mock', async () => {
    const { deps, run, provider } = setup();
    await run([tee, chino]);
    const cached = planRender(
      PROFILE,
      `profile:${PROFILE}`,
      'https://person.test/me.jpg',
      [tee, chino],
      provider.name,
    );
    expect(await checkRenderBudget(deps, cached, 0)).toEqual({ ok: true });
    const mockDeps = { ...deps, provider: { name: 'mock', render: provider.render } };
    const fresh = planRender(PROFILE, 'other', 'u', [jacket], 'mock');
    expect(await checkRenderBudget(mockDeps, fresh, 0)).toEqual({ ok: true });
  });

  it('only counts renders inside the 24 h window', async () => {
    const { deps, run, store, provider } = setup();
    await run([tee, chino]);
    for (const r of store.rows)
      r.createdAt = new Date(Date.now() - RENDER_LIMIT_WINDOW_MS - 1000).toISOString();
    const plan = planRender(PROFILE, 'p2', 'u', [jacket], provider.name);
    expect(await checkRenderBudget(deps, plan, 1)).toEqual({ ok: true });
  });
});
