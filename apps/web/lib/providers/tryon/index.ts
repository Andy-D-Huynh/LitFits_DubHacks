import 'server-only';
import { env } from '../../env';
import { selectTryOnProvider } from './select';
import type { TryOnProvider } from './types';

export type { TryOnProvider, TryOnInput, TryOnCategory } from './types';

let warned = false;

export function getTryOnProvider(demo: boolean): TryOnProvider {
  const { provider, warning } = selectTryOnProvider(env(), demo);
  if (warning && !warned) {
    console.warn(warning);
    warned = true;
  }
  return provider;
}
