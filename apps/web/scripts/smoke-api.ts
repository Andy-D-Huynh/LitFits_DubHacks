// Live smoke test of the API against a running server and the real Supabase project.
// Creates a throwaway confirmed user (admin API), calls the routes with its
// access token, then deletes the user (profile, outfits, renders cascade).
// Usage: pnpm --filter @fitmirror/web smoke [baseUrl]   (default http://localhost:3000)
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const base = process.argv[2] ?? 'http://localhost:3000';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error(
    'Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY',
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const DEMO_PROFILE = '00000000-0000-4000-8000-0000000000d1';
const TEE = '00000000-0000-4000-8000-000000000001';
let failures = 0;
const cleanupUserIds: string[] = [];

function check(name: string, ok: boolean, detail?: unknown) {
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`,
  );
  if (!ok) failures++;
}

async function call(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json: json as Record<string, unknown> };
}

async function newUser() {
  const email = `smoke-${randomUUID()}@example.test`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const session = await client.auth.signInWithPassword({ email, password });
  if (session.error) throw new Error(`signIn: ${session.error.message}`);
  return { id: data.user.id, token: session.data.session.access_token };
}

async function profileChecks(token: string, otherToken: string) {
  const none = await call(token, 'GET', '/api/profile');
  check('GET /api/profile before saving → 404', none.status === 404, none);

  const bad = await call(token, 'PUT', '/api/profile', { heightCm: 17, measurements: {} });
  check('PUT /api/profile rejects implausible height → 400', bad.status === 400, bad.status);

  const input = { heightCm: 178, fitPreference: 'regular', measurements: { chest: 98, waist: 84 } };
  const created = await call(token, 'PUT', '/api/profile', input);
  check('PUT /api/profile creates → 201', created.status === 201, created);
  const updated = await call(token, 'PUT', '/api/profile', { ...input, heightCm: 180 });
  check(
    'PUT /api/profile again updates the same profile → 200',
    updated.status === 200 && updated.json.id === created.json.id && updated.json.heightCm === 180,
    updated,
  );
  check(
    'measurement source is manual',
    JSON.stringify(updated.json.measurementSource) === '{"chest":"manual","waist":"manual"}',
    updated.json.measurementSource,
  );

  const other = await call(otherToken, 'GET', '/api/profile');
  check("another user can't see this profile → 404", other.status === 404, other.status);

  const anon = await call(null, 'GET', '/api/profile');
  check('GET /api/profile with no session → 401', anon.status === 401, anon.status);

  const badToken = await call('not-a-jwt', 'PUT', '/api/profile', input);
  check('PUT /api/profile with a bad token → 401', badToken.status === 401, badToken.status);

  // Cookie session: first PUT signs in anonymously and sets the auth cookie.
  const put = await fetch(`${base}/api/profile`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const anonProfile = (await put.json()) as { id?: string; userId?: string };
  if (anonProfile.userId) cleanupUserIds.push(anonProfile.userId);
  const cookie = put.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  check(
    'cookie PUT signs in anonymously → 201',
    put.status === 201 && cookie.includes('sb-'),
    put.status,
  );
  const again = await fetch(`${base}/api/profile`, { headers: { cookie } });
  const againBody = (await again.json()) as { id?: string };
  check(
    'cookie session reads the same profile back',
    again.status === 200 && againBody.id === anonProfile.id,
    again.status,
  );

  const demo = await call(null, 'GET', '/api/profile?demo=1');
  check(
    'demo profile served without auth',
    demo.status === 200 && demo.json.heightCm === 178,
    demo.status,
  );
  return created.json.id as string;
}

async function fitChecks(token: string, otherToken: string, profileId: string) {
  const g = await call(null, 'GET', `/api/garments/${TEE}`);
  check(
    'GET /api/garments/:id → seeded placeholder',
    g.status === 200 && g.json.isPlaceholder === true,
    g,
  );
  const bad = await call(null, 'GET', '/api/garments/not-a-uuid');
  check('GET /api/garments/:id rejects a bad id → 400', bad.status === 400, bad.status);
  const missing = await call(null, 'GET', '/api/garments/00000000-0000-4000-8000-00000000ffff');
  check('GET /api/garments/:id unknown → 404', missing.status === 404, missing.status);

  const fit = await call(token, 'POST', '/api/fit', { garmentId: TEE, profileId });
  check(
    'POST /api/fit → per-size verdicts for own profile',
    fit.status === 200 && Array.isArray(fit.json.perSize) && fit.json.perSize.length === 4,
    fit,
  );
  const other = await call(otherToken, 'POST', '/api/fit', { garmentId: TEE, profileId });
  check("POST /api/fit with another user's profile → 404", other.status === 404, other.status);
  const noAuth = await call(null, 'POST', '/api/fit', { garmentId: TEE, profileId });
  check('POST /api/fit without auth → 401', noAuth.status === 401, noAuth.status);
  const demo = await call(null, 'POST', '/api/fit?demo=1', {
    garmentId: TEE,
    profileId: DEMO_PROFILE,
  });
  check(
    'POST /api/fit in demo mode → L',
    demo.status === 200 && demo.json.recommendedSize === 'L',
    demo.json,
  );
}

const steps = (process.argv[3] ?? 'all').split(',');
const users = [await newUser(), await newUser()];
try {
  const [a, b] = users as [
    Awaited<ReturnType<typeof newUser>>,
    Awaited<ReturnType<typeof newUser>>,
  ];
  const profileId = await profileChecks(a.token, b.token);
  if (steps.includes('all') || steps.includes('fit')) await fitChecks(a.token, b.token, profileId);
} finally {
  const ids = [...users.map((u) => u.id), ...cleanupUserIds];
  for (const id of ids) await admin.auth.admin.deleteUser(id);
  console.log(`cleaned up ${ids.length} smoke users`);
}
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
