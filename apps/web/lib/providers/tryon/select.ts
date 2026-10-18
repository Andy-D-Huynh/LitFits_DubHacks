import { DEFAULT_FAL_TRYON_MODEL, FalTryOn, falSubscribeWithKey, type FalSubscribe } from './fal';
import { MockTryOn } from './mock';
import { ReplicateTryOn } from './replicate';
import type { TryOnProvider } from './types';

export type TryOnEnv = {
  TRYON_PROVIDER: 'fal' | 'replicate' | 'gemini' | 'mock';
  TRYON_MODEL?: string | undefined;
  FAL_KEY?: string | undefined;
  REPLICATE_API_TOKEN?: string | undefined;
};

export type Selection = { provider: TryOnProvider; warning: string | null };

// fal is the preferred real provider; Replicate remains an option. Mock is used
// in demo mode, by default, and whenever the selected provider's credentials
// are missing, so a missing key never breaks the app or spends money.
export function selectTryOnProvider(
  e: TryOnEnv,
  demo: boolean,
  makeFal: (key: string) => FalSubscribe = falSubscribeWithKey,
): Selection {
  const mock = (warning: string | null = null): Selection => ({
    provider: new MockTryOn(),
    warning,
  });
  if (demo || e.TRYON_PROVIDER === 'mock') return mock();
  if (e.TRYON_PROVIDER === 'fal') {
    if (!e.FAL_KEY) return mock('TRYON_PROVIDER=fal but FAL_KEY is not set; using the mock');
    return {
      provider: new FalTryOn(makeFal(e.FAL_KEY), e.TRYON_MODEL ?? DEFAULT_FAL_TRYON_MODEL),
      warning: null,
    };
  }
  if (e.TRYON_PROVIDER === 'replicate') {
    if (!e.REPLICATE_API_TOKEN || !e.TRYON_MODEL) {
      return mock(
        'TRYON_PROVIDER=replicate needs REPLICATE_API_TOKEN and TRYON_MODEL; using the mock',
      );
    }
    return { provider: new ReplicateTryOn(e.REPLICATE_API_TOKEN, e.TRYON_MODEL), warning: null };
  }
  return mock(`Try-on provider "${e.TRYON_PROVIDER}" is not implemented; using the mock`);
}
