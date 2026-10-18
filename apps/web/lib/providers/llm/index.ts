import 'server-only';
import { env } from '../../env';
import { AnthropicNormalizer, DEFAULT_LLM_MODEL } from './anthropic';
import { MockNormalizer } from './mock';
import type { GarmentNormalizer } from './types';

export type { GarmentNormalizer, NormalizedGarment } from './types';

// The deterministic mock is the default and always used in demo mode. The LLM
// is used only when LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY is set.
export function getNormalizer(demo: boolean): GarmentNormalizer {
  const e = env();
  if (demo || e.LLM_PROVIDER === 'mock') return new MockNormalizer();
  if (!e.ANTHROPIC_API_KEY) throw new Error('LLM_PROVIDER=anthropic needs ANTHROPIC_API_KEY');
  return new AnthropicNormalizer(e.ANTHROPIC_API_KEY, e.LLM_MODEL ?? DEFAULT_LLM_MODEL);
}
