// Fixed-window rate limiter kept in memory. Per server instance only (each
// serverless instance has its own window), which is enough to blunt abuse of a
// hackathon endpoint without adding a paid store.

export type RateLimiter = (
  key: string,
  now?: number,
) => { ok: true } | { ok: false; retryAfterS: number };

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key, now = Date.now()) => {
    const entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
      }
      return { ok: true };
    }
    if (entry.count >= limit)
      return { ok: false, retryAfterS: Math.ceil((entry.resetAt - now) / 1000) };
    entry.count++;
    return { ok: true };
  };
}

export function clientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown'
  );
}
