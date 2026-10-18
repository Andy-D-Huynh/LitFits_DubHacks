-- FitMirror initial schema. Canonical with packages/shared/src/schemas.ts.
-- Ownership: profiles.user_id = auth.uid() (anonymous sign-in); every other
-- user-owned table is owned through profile_id. garments is a shared catalog.
-- Columns the server must control (render status, payment refs) are written
-- only with the service role, so users get read-only policies there.

-- ---------- Tables ----------

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  height_cm numeric not null check (height_cm > 0),
  fit_preference text not null default 'regular'
    check (fit_preference in ('snug', 'regular', 'loose')),
  measurements jsonb not null,            -- cm: shoulder_width, chest, waist, hip, inseam, arm_length
  measurement_source jsonb,               -- per key: manual | photo
  confidence jsonb,                       -- per key: 0..1
  model_photo_path text,
  face_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);
create index profiles_user_id_idx on public.profiles (user_id);

create table public.garments (
  id uuid primary key default gen_random_uuid(),
  source_url text unique,
  retailer text,
  brand text,
  name text,
  category text not null check (category in ('top', 'bottom', 'outerwear', 'dress')),
  image_urls text[] not null default '{}',
  primary_image_url text,
  primary_color text,
  price_cents int check (price_cents >= 0),
  currency text check (char_length(currency) = 3),
  fit_type text check (fit_type in ('slim', 'regular', 'relaxed')),
  stretch text not null default 'none' check (stretch in ('none', 'low', 'high')),
  chart_type text check (chart_type in ('body', 'garment')),
  measurement_basis text check (measurement_basis in ('circumference', 'flat')),
  size_chart jsonb,                       -- SizeChart, always cm
  extraction_method text not null
    check (extraction_method in ('dom', 'llm_html', 'llm_vision', 'manual', 'fixture')),
  extraction_confidence numeric check (extraction_confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles on delete cascade,
  name text,
  created_at timestamptz not null default now()
);
create index outfits_profile_id_idx on public.outfits (profile_id);

-- One row per slot. A dress fills top and bottom; the API enforces that.
create table public.outfit_items (
  outfit_id uuid not null references public.outfits on delete cascade,
  garment_id uuid not null references public.garments,
  selected_size text,
  slot text not null check (slot in ('top', 'bottom', 'outerwear', 'dress')),
  position int,
  primary key (outfit_id, slot)
);

create table public.tryon_renders (
  id uuid primary key default gen_random_uuid(),
  cache_key text unique not null,
  profile_id uuid references public.profiles on delete cascade,
  garment_ids uuid[],
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  provider text,
  image_path text,
  error text,
  created_at timestamptz not null default now()
);
create index tryon_renders_profile_id_idx on public.tryon_renders (profile_id);

create table public.capture_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles on delete cascade,
  status text not null default 'waiting',
  expires_at timestamptz
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles on delete cascade,
  outfit_id uuid references public.outfits on delete set null,
  status text,
  total_cents int check (total_cents >= 0),
  payment_provider text,
  payment_ref text,
  created_at timestamptz not null default now()
);
create index orders_profile_id_idx on public.orders (profile_id);

create table public.order_lines (
  order_id uuid not null references public.orders on delete cascade,
  garment_id uuid not null references public.garments,
  size text,
  retailer text,
  price_cents int check (price_cents >= 0),
  status text
);
create index order_lines_order_id_idx on public.order_lines (order_id);

-- ---------- Row-level security ----------

-- Runs as the caller, so the profiles RLS policy below does the filtering.
create function public.owns_profile(pid uuid) returns boolean
  language sql stable
  set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = pid and p.user_id = auth.uid());
$$;

alter table public.profiles enable row level security;
alter table public.garments enable row level security;
alter table public.outfits enable row level security;
alter table public.outfit_items enable row level security;
alter table public.tryon_renders enable row level security;
alter table public.capture_sessions enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;

create policy "own profile" on public.profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Shared catalog: anyone reads; writes only via the service role (ingest API, seed).
create policy "read garments" on public.garments for select to anon, authenticated
  using (true);

create policy "own outfits" on public.outfits for all to authenticated
  using (public.owns_profile(profile_id)) with check (public.owns_profile(profile_id));

create policy "own outfit items" on public.outfit_items for all to authenticated
  using (exists (select 1 from public.outfits o
                 where o.id = outfit_id and public.owns_profile(o.profile_id)))
  with check (exists (select 1 from public.outfits o
                      where o.id = outfit_id and public.owns_profile(o.profile_id)));

-- The phone is not signed in; it reaches its session through the API (service role).
create policy "own capture sessions" on public.capture_sessions for all to authenticated
  using (public.owns_profile(profile_id)) with check (public.owns_profile(profile_id));

-- Read-only for users: status, image paths, and payment refs are server-written.
create policy "read own renders" on public.tryon_renders for select to authenticated
  using (public.owns_profile(profile_id));

create policy "read own orders" on public.orders for select to authenticated
  using (public.owns_profile(profile_id));

create policy "read own order lines" on public.order_lines for select to authenticated
  using (exists (select 1 from public.orders o
                 where o.id = order_id and public.owns_profile(o.profile_id)));

-- ---------- Realtime ----------
-- Desktop listens for phone capture completion and render status changes.

alter publication supabase_realtime add table public.capture_sessions, public.tryon_renders;

-- ---------- Storage ----------
-- Private buckets with no user policies: all reads and uploads go through
-- server-issued signed URLs (10 min expiry, see docs/checkout-privacy.md).

insert into storage.buckets (id, name, public)
values ('model-photos', 'model-photos', false), ('renders', 'renders', false)
on conflict (id) do nothing;
