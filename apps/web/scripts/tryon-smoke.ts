// One real fal try-on render, to verify the integration once FAL_KEY is set.
//
//   pnpm --filter @fitmirror/web tryon:smoke -- --photo ./me.jpg --garment-image ./tee.jpg
//   pnpm --filter @fitmirror/web tryon:smoke -- --profile <profile-id> --garment-image <url>
//
// Options:
//   --photo <path>          your full-body photo (processed exactly like an upload:
//                           EXIF stripped, head blurred; --head-box x,y,w,h to place the
//                           blur, otherwise the top band of the photo is blurred)
//   --profile <id>          instead of --photo: use the photo already uploaded for that profile
//   --garment <name|id>     fixture garment (default top-crew-tee); sets the category
//   --garment-image <path|url>  product image; the placeholder fixtures have none
//   --dry-run               do everything except the fal call (no cost)
//
// Makes exactly one fal call (unless --dry-run), writes no database rows, and
// deletes the temporary files it uploads. Output goes to apps/web/.smoke/.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { FALLBACK_HEAD_BOX, GarmentFixtureSchema, NormBoxSchema } from '@fitmirror/shared';
import { createClient } from '@supabase/supabase-js';
import { fixtureToGarment } from '../lib/fixtures';
import { blurRegion, processModelPhoto } from '../lib/photos/process';
import { MODEL_PHOTOS_BUCKET, signedPhotoUrl, tryOnPhotoPath } from '../lib/photos/storage';
import {
  DEFAULT_FAL_TRYON_MODEL,
  FalTryOn,
  falSubscribeWithKey,
  toFalInput,
} from '../lib/providers/tryon/fal';
import { toLayers } from '../lib/tryon/pipeline';

// pnpm forwards a literal "--" separator; drop it so both invocation styles work.
const argv = process.argv.slice(2);
const { values: args } = parseArgs({
  args: argv[0] === '--' ? argv.slice(1) : argv,
  options: {
    photo: { type: 'string' },
    profile: { type: 'string' },
    garment: { type: 'string', default: 'top-crew-tee' },
    'garment-image': { type: 'string' },
    'head-box': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

function fail(message: string): never {
  console.error(`tryon:smoke: ${message}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const falKey = process.env.FAL_KEY;
if (!url || !serviceKey)
  fail('needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local');
if (!args['dry-run'] && !falKey) fail('needs FAL_KEY in apps/web/.env.local (or pass --dry-run)');
if (!args.photo === !args.profile) fail('pass exactly one of --photo <path> or --profile <id>');

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const outDir = join(import.meta.dirname, '../.smoke');
mkdirSync(outDir, { recursive: true });
const runId = randomUUID();
const uploaded: { bucket: string; path: string }[] = [];

const redact = (u: string) => u.replace(/([?&](token|X-Amz-[^=]+)=)[^&]+/g, '$1…');

async function upload(bucket: string, path: string, body: Buffer, contentType: string) {
  const { error } = await admin.storage
    .from(bucket)
    .upload(path, body, { contentType, upsert: true });
  if (error) fail(`upload to ${bucket} failed: ${error.message}`);
  uploaded.push({ bucket, path });
  const { data, error: signError } = await admin.storage.from(bucket).createSignedUrl(path, 600);
  if (signError) fail(`signing failed: ${signError.message}`);
  return data.signedUrl;
}

async function personImageUrl(): Promise<string> {
  if (args.profile) {
    const { data, error } = await admin
      .from('profiles')
      .select('model_photo_path, face_opt_in')
      .eq('id', args.profile)
      .maybeSingle<{ model_photo_path: string | null; face_opt_in: boolean }>();
    if (error || !data) fail(`profile ${args.profile} not found`);
    if (!data.model_photo_path) fail('that profile has no uploaded photo yet');
    const path = tryOnPhotoPath({
      modelPhotoPath: data.model_photo_path,
      faceOptIn: data.face_opt_in,
    });
    console.log(`person: profile photo ${path}`);
    return signedPhotoUrl(admin, path);
  }
  const photo = await processModelPhoto(readFileSync(args.photo!));
  let box = FALLBACK_HEAD_BOX;
  if (args['head-box']) {
    const [x, y, w, h] = args['head-box'].split(',').map(Number);
    const parsed = NormBoxSchema.safeParse({ x, y, w, h });
    if (!parsed.success)
      fail('--head-box must be x,y,w,h fractions of the image, e.g. 0.35,0,0.3,0.2');
    box = parsed.data;
  }
  const faceless = await blurRegion(photo, box);
  const local = join(outDir, 'person-faceless.jpg');
  writeFileSync(local, faceless);
  console.log(`person: ${args.photo} → faceless copy saved to ${local} (check the blur)`);
  return upload(MODEL_PHOTOS_BUCKET, `smoke/${runId}/faceless.jpg`, faceless, 'image/jpeg');
}

function loadGarment() {
  const dir = join(import.meta.dirname, '../../../fixtures/garments');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const fixture = GarmentFixtureSchema.parse(JSON.parse(readFileSync(join(dir, file), 'utf8')));
    if (file === `${args.garment}.json` || fixture.id === args.garment)
      return fixtureToGarment(fixture);
  }
  return fail(`no fixture garment "${args.garment}" in fixtures/garments`);
}

async function garmentImageUrl(fixtureImage: string | null): Promise<string> {
  const source = args['garment-image'];
  if (source && /^https?:\/\//.test(source)) return source;
  if (source) {
    const ext = extname(source).toLowerCase();
    const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return upload('renders', `smoke/${runId}/garment${ext || '.jpg'}`, readFileSync(source), type);
  }
  if (fixtureImage) return fixtureImage;
  return fail('this fixture has no product image; pass --garment-image <path|url>');
}

try {
  const garment = loadGarment();
  const layer = toLayers([garment])[0]!;
  const input = {
    personImageUrl: await personImageUrl(),
    garmentImageUrl: await garmentImageUrl(garment.primaryImageUrl),
    category: layer.category,
    description: layer.description,
  };
  const endpoint = process.env.TRYON_MODEL ?? DEFAULT_FAL_TRYON_MODEL;
  console.log(`garment: ${garment.name} (${garment.category} → ${toFalInput(input).category})`);
  console.log(`endpoint: ${endpoint}`);

  if (args['dry-run']) {
    const falInput = toFalInput(input);
    console.log('dry run, would send:', {
      ...falInput,
      model_image: redact(falInput.model_image),
      garment_image: redact(falInput.garment_image),
    });
    for (const [label, u] of [
      ['person', input.personImageUrl],
      ['garment', input.garmentImageUrl],
    ]) {
      const res = await fetch(u!);
      console.log(`  ${label} image reachable: ${res.status} ${res.headers.get('content-type')}`);
      if (!res.ok) process.exitCode = 1;
    }
  } else {
    const started = Date.now();
    const out = await new FalTryOn(falSubscribeWithKey(falKey!), endpoint).render(input);
    const res = await fetch(out.imageUrl);
    if (!res.ok) fail(`downloading the render failed (${res.status})`);
    const file = join(outDir, `tryon-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`render: ${((Date.now() - started) / 1000).toFixed(1)} s → ${file}`);
  }
} finally {
  for (const { bucket, path } of uploaded) await admin.storage.from(bucket).remove([path]);
  if (uploaded.length) console.log(`cleaned up ${uploaded.length} temporary upload(s)`);
}
