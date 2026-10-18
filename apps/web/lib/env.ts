import 'server-only';
import { z } from 'zod';

// Server env, validated once on first use. Everything is optional so demo
// mode runs with no secrets; code that needs a value checks for it.

const optional = z.string().min(1).optional();

const ServerEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  ANTHROPIC_API_KEY: optional,
  LLM_MODEL: optional,
  TRYON_PROVIDER: z.enum(['replicate', 'gemini', 'mock']).default('mock'),
  REPLICATE_API_TOKEN: optional,
  TRYON_MODEL: optional,
  GEMINI_API_KEY: optional,
  FAL_KEY: optional,
  PAYMENT_PROVIDER: z.enum(['visa', 'mock']).default('mock'),
  MESSAGING_PROVIDER: z.enum(['photon', 'mock']).default('mock'),
  DEMO_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (!cached) {
    // Empty strings (e.g. `KEY=` in .env files) count as unset.
    const raw = Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ''),
    );
    cached = ServerEnvSchema.parse(raw);
  }
  return cached;
}
