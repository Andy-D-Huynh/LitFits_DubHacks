# Architecture

Spec sections 3, 5, 6, 17. Once code exists, `packages/shared/src/types.ts`, `schemas.ts`, and the SQL migrations are canonical over this file.

## System diagram

```
[Phone browser /capture/:id] --realtime--> [Supabase] <--> [Next.js app: web UI + route handlers]
                                                               |
[Chrome MV3 extension] --POST /api/garments/ingest------------+
  content script + side panel                                  +--> LLM API (extraction only)
                                                               +--> TryOnProvider (Replicate / Gemini / Mock)
                                                               +--> PaymentProvider (Visa sandbox / Mock)
                                                               +--> MessagingChannel (Photon / Mock)
```

## Stack (default; change only if the open questions in `build-plan.md` say so)

- Monorepo with pnpm workspaces.
- `apps/web`: Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui, Zustand, TanStack Query.
- 3D: react-three-fiber and drei.
- `apps/extension`: Manifest V3, Vite with CRXJS, React side panel.
- Backend: Next.js route handlers only. No separate Python service.
- Data: Supabase (Postgres, private Storage bucket, Realtime for phone-to-desktop sync).
- Pose and segmentation: `@mediapipe/tasks-vision`, run in the phone browser.
- LLM (extraction): Anthropic API, model name from env.
- `packages/shared`: types, zod schemas, fit engine, fit rules, unit conversion. Used by web and extension.

## Repo layout

```
apps/web/app/(studio)/studio/page.tsx
apps/web/app/onboarding/page.tsx
apps/web/app/capture/[sessionId]/page.tsx
apps/web/app/compare/page.tsx
apps/web/app/checkout/page.tsx
apps/web/app/api/...                      (routes below)
apps/web/lib/providers/{tryon,payment,messaging}/
apps/extension/src/{content,sidepanel,background}/
packages/shared/src/{types.ts,schemas.ts,dims.ts,fit-engine.ts,fit-rules.ts,units.ts,measure.ts}
fixtures/garments/*.json
fixtures/renders/*.jpg
```

## Data model (Postgres)

```sql
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  height_cm numeric not null,
  fit_preference text default 'regular',  -- snug | regular | loose
  measurements jsonb not null,            -- cm: shoulder_width, chest, waist, hip, inseam, arm_length
  measurement_source jsonb,               -- per key: manual | photo
  confidence jsonb,                       -- per key: 0..1
  model_photo_path text,
  face_opt_in boolean default false,
  created_at timestamptz default now()
);

create table garments (
  id uuid primary key default gen_random_uuid(),
  source_url text unique,
  retailer text, brand text, name text,
  category text not null,                 -- top | bottom | outerwear | dress
  image_urls text[], primary_image_url text,
  primary_color text,
  price_cents int, currency text,
  fit_type text,                          -- slim | regular | relaxed
  stretch text default 'none',            -- none | low | high
  chart_type text,                        -- body | garment
  measurement_basis text,                 -- circumference | flat
  size_chart jsonb,                       -- see SizeChart type
  extraction_method text,                 -- dom | llm_html | llm_vision | manual | fixture
  extraction_confidence numeric,
  created_at timestamptz default now()
);

create table outfits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles,
  name text,
  created_at timestamptz default now()
);

create table outfit_items (
  outfit_id uuid references outfits,
  garment_id uuid references garments,
  selected_size text,
  slot text not null,                     -- top | bottom | outerwear | dress
  position int,
  primary key (outfit_id, slot)
);

create table tryon_renders (
  id uuid primary key default gen_random_uuid(),
  cache_key text unique not null,
  profile_id uuid references profiles,
  garment_ids uuid[],
  status text default 'queued',           -- queued | running | done | failed
  provider text, image_path text, error text,
  created_at timestamptz default now()
);

create table capture_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  status text default 'waiting',
  expires_at timestamptz
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid, outfit_id uuid,
  status text, total_cents int,
  payment_provider text, payment_ref text,
  created_at timestamptz default now()
);

create table order_lines (
  order_id uuid references orders,
  garment_id uuid references garments,
  size text, retailer text, price_cents int, status text
);
```

Enable row-level security on every table. `profiles` is keyed by `user_id` (from Supabase anonymous sign-in); other user-owned tables check ownership through `profile_id → profiles.user_id`. `garments` is a shared catalog: public read, service-role writes. See decisions in `build-plan.md`.

## Key shared types

```ts
type Dim = 'shoulder' | 'chest' | 'waist' | 'hip' | 'inseam' | 'length' | 'sleeve';
type SizeRow = { label: string } & Partial<Record<Dim, number | [number, number]>>;
// number = garment measure, [min, max] = body range
type SizeChart = { unit: 'cm'; rows: SizeRow[] };
type FitVerdict = 'tight' | 'good' | 'loose' | 'unknown';
type DimResult = {
  dim: Dim; bodyCm: number; garmentCm?: number; rangeCm?: [number, number];
  easeCm?: number; verdict: FitVerdict; note: string;
};
type SizeResult = { size: string; overall: FitVerdict; score: number; dims: DimResult[] };
type FitResult = {
  garmentId: string; recommendedSize: string | null;
  confidence: 'high' | 'medium' | 'low'; perSize: SizeResult[]; warnings: string[];
};
```

## API routes

**Capture and profile**
- `POST /api/capture-sessions` → `{ id, qrUrl }`. Phone opens `qrUrl`.
- `POST /api/capture-sessions/:id/complete` takes height, measurements, confidence, model photo upload path. Broadcasts over Realtime so the desktop updates live.
- `PUT /api/profile` creates or updates the profile (manual edits set source to `manual`).

**Garments and fit**
- `POST /api/garments/ingest` takes `source` (extension | url | screenshot), `url`, `title`, `jsonld`, `imageUrls`, `chartHtml`, `pageText` (max 8000 chars), optional screenshot path. Returns `Garment`. Idempotent on `source_url`.
- `GET /api/garments/:id`.
- `POST /api/fit` takes `garmentId`, `profileId` → `FitResult`. Pure computation, no LLM.
- `GET /api/alternatives?garmentId=&profileId=` returns ingested garments of the same category ranked by fit score for this user.

**Try-on**
- `POST /api/tryon` takes `garmentIds`, `profileId` → `{ renderId, status }`. Cache hit returns `done` immediately.
- `GET /api/tryon/:id` → status and signed image URL.

**Outfits**
- CRUD `/api/outfits`.
- `POST /api/outfits/:id/items` takes `garmentId`, `size`. Adds the item; if the slot is occupied it swaps and returns `replacedGarmentId` so the client can offer Undo.
- `PATCH /api/outfits/:id/items/:slot` takes `garmentId`, `size`. Swaps the garment or changes the size in place, keeping layer position. Returns the updated outfit and a `FitResult` per item.
- `DELETE /api/outfits/:id/items/:slot` removes the item in that slot; a dress clears both top and bottom.

**Checkout**
- `POST /api/checkout/session` takes `outfitId` → `{ orderId, clientData }`.
- `POST /api/checkout/:id/confirm`.

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
LLM_MODEL
TRYON_PROVIDER        # replicate | gemini | mock
REPLICATE_API_TOKEN
TRYON_MODEL
GEMINI_API_KEY
PAYMENT_PROVIDER      # visa | mock
VISA_*                # per sandbox docs
MESSAGING_PROVIDER    # photon | mock
DEMO_MODE
```
