import { z } from 'zod';
import type { TryOnInput, TryOnProvider } from './types';

// IDM-VTON-style model on Replicate (docs/tryon.md). Model from TRYON_MODEL,
// either "owner/name" (official model endpoint) or "owner/name:version".
// Input names follow cuuupid/idm-vton; other models may need a different mapping.

const PredictionSchema = z.object({
  id: z.string(),
  status: z.enum(['starting', 'processing', 'succeeded', 'failed', 'canceled']),
  output: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
  error: z.unknown().optional(),
  urls: z.object({ get: z.string() }),
});

const POLL_MS = 2000;
const TIMEOUT_MS = 120_000;

export class ReplicateTryOn implements TryOnProvider {
  readonly name = 'replicate';

  constructor(
    private readonly token: string,
    private readonly model: string,
  ) {}

  private async request(url: string, init?: RequestInit) {
    const res = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
        ...init?.headers,
      },
    });
    if (!res.ok) throw new Error(`Replicate ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return PredictionSchema.parse(await res.json());
  }

  async render(input: TryOnInput): Promise<{ imageUrl: string }> {
    const body = {
      input: {
        human_img: input.personImageUrl,
        garm_img: input.garmentImageUrl,
        garment_des: input.description,
        category: input.category,
      },
    };
    const [owner, version] = this.model.split(':');
    const url = version
      ? 'https://api.replicate.com/v1/predictions'
      : `https://api.replicate.com/v1/models/${owner}/predictions`;
    let p = await this.request(url, {
      method: 'POST',
      headers: { prefer: 'wait=60' },
      body: JSON.stringify(version ? { ...body, version } : body),
    });

    const deadline = Date.now() + TIMEOUT_MS;
    while (p.status === 'starting' || p.status === 'processing') {
      if (Date.now() > deadline) throw new Error('Replicate render timed out');
      await new Promise((r) => setTimeout(r, POLL_MS));
      p = await this.request(p.urls.get);
    }
    if (p.status !== 'succeeded')
      throw new Error(`Replicate render ${p.status}: ${String(p.error)}`);
    const out = Array.isArray(p.output) ? p.output[0] : p.output;
    if (!out) throw new Error('Replicate returned no image');
    return { imageUrl: out };
  }
}
