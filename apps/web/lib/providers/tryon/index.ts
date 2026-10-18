import 'server-only';
import { env } from '../../env';
import { MockTryOn } from './mock';
import type { TryOnProvider } from './types';

export type { TryOnProvider, TryOnInput, TryOnCategory } from './types';

export function getTryOnProvider(demo: boolean): TryOnProvider {
  const provider = env().TRYON_PROVIDER;
  if (demo || provider === 'mock') return new MockTryOn();
  throw new Error(`Try-on provider "${provider}" is not implemented yet (M3)`);
}
