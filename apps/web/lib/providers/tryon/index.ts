import 'server-only';
import { env } from '../../env';
import { MockTryOn } from './mock';
import { ReplicateTryOn } from './replicate';
import type { TryOnProvider } from './types';

export type { TryOnProvider, TryOnInput, TryOnCategory } from './types';

// Mock is the default and always used in demo mode. A real provider is used
// only when TRYON_PROVIDER selects it and its credentials are set.
export function getTryOnProvider(demo: boolean): TryOnProvider {
  const e = env();
  if (demo || e.TRYON_PROVIDER === 'mock') return new MockTryOn();
  if (e.TRYON_PROVIDER === 'replicate') {
    if (!e.REPLICATE_API_TOKEN || !e.TRYON_MODEL) {
      throw new Error('TRYON_PROVIDER=replicate needs REPLICATE_API_TOKEN and TRYON_MODEL');
    }
    return new ReplicateTryOn(e.REPLICATE_API_TOKEN, e.TRYON_MODEL);
  }
  throw new Error(`Try-on provider "${e.TRYON_PROVIDER}" is not implemented yet`);
}
