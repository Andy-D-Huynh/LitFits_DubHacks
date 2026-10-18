# Build plan

Spec sections 15 and 18. Times assume roughly a 36-hour hack and a team of three or four; scale to the actual team (open question 1).

## Workstreams

- **A**: body and capture
- **B**: extension and ingestion
- **C**: fit, try-on, and 3D
- **D**: outfits, checkout, and polish

## Milestones

| Milestone | Hours | Work | Checkpoint |
|---|---|---|---|
| **M0** | h0–2 | Repo, Supabase, deploy skeleton, shared types, fixtures loaded. | — |
| **M1** | h2–10 | A: manual profile + `MeasurementEditor`. C: fit engine with unit tests. Studio with `FitPanel` on fixtures. Outfit store with add, remove, swap, undo. | Pick a fixture, see a size verdict with explanations. |
| **M2** | h2–14 (parallel) | B: ingest API, LLM normalization, extension content script and side panel. | Click Add to figure on a real product page and get a garment row. |
| **M3** | h10–20 | C: try-on providers, caching, queue, viewport. (3D mannequin with heatmap: **deferred**, see question 1.) | Render appears next to verdict; swapping or removing an item re-renders only the affected layers. |
| **M4** | h14–22 | A: phone capture, QR handoff, MediaPipe estimation, calibration against tape measurements. | — |
| **M5** | h20–28 | D: outfits, compare, cart by retailer, VISA sandbox flow, alternatives. **Feature freeze at h28.** | — |
| **M6** | h28–34 | Polish, demo mode, recorded fallback video, README, rehearsal. | — |
| **M7** | — | Tier 3 only if everything above passes. | — |

## Acceptance criteria

- **Tier 1:** from a clean profile, a real product page produces a garment, a per-size verdict with explanations, and a try-on image within 60 seconds. The same flow works in demo mode with no network. Clicking any worn item on the figure lets you remove it or swap it for another from the closet, and the fit panel and try-on update without losing the rest of the outfit.
- **Tier 2:** phone capture fills the profile within 30 seconds; compare shows three outfits; checkout completes in sandbox.
- **Fit engine:** at least 20 unit tests covering both chart types, flat vs circumference, stretch, between-sizes, and missing dims.

## Open questions (section 18)

Answer these and the defaults in the docs get replaced. Write answers inline and update the affected doc.

1. Team size, event length, and who owns which workstream?
   - Answer: three people. Andy owns the 2D back end (schema, ingest API, fit engine, try-on pipeline). A partner owns the studio UI and the extension. A third teammate researches 3D, which is **deferred** (out of M3 until un-deferred). Event length: _TODO_.
2. What exactly does the VISA track prompt ask for, and which Visa APIs or sandboxes are provided? (Checkout design is a placeholder until this is known.)
   - Answer: _TODO_
3. What does Photon offer (API, channel, sandbox)? Is the side track still undecided?
   - Answer: _TODO_
4. Which try-on API can you actually use (Replicate, Gemini, or something else), and do you already have keys?
   - Answer: _TODO_
5. Which two or three retailers for the demo and fixtures?
   - Answer: _TODO_ (retailers not yet named). Until then, fixtures are placeholders marked `"placeholder": true`; real verified charts replace them later.
6. Are tops and bottoms enough for v1, or do you need dresses and shoes?
   - Answer: _TODO_
7. Is a Chrome extension acceptable to the track and judges, or must everything be a plain web app plus phone?
   - Answer: _TODO_
8. Metric, imperial, or both in the UI?
   - Answer: _TODO_

## Decisions (M0, 2026-10-17)

- **Ownership and RLS:** only `profiles` has `user_id`. Every other user-owned table (`outfits`, `outfit_items`, `tryon_renders`, `capture_sessions`, `orders`, `order_lines`) checks ownership through `profile_id → profiles.user_id` (child tables via their parent). `garments` is a shared catalog: public read, writes only with the service role.
- **Auth:** Supabase anonymous sign-in provides `user_id`. No login screen.
- **Measurement key mapping:** profile keys (`shoulder_width`, `chest`, `waist`, `hip`, `inseam`, `arm_length`) and chart dims (`shoulder`, `chest`, `waist`, `hip`, `inseam`, `length`, `sleeve`) keep their names. A single shared module, `packages/shared/src/dims.ts`, owns the mapping, and the fit engine and `measure.ts` both use it.
- **Fixtures:** schema-valid placeholders with `"placeholder": true` until real retailer charts are supplied (see question 5).
- **Supabase:** hosted project. Keys go in `apps/web/.env.local` (never committed).
- **Deploy:** Vercel, project root `apps/web`.
- **Package scope:** `@fitmirror/*` (`@fitmirror/shared`, `@fitmirror/web`, `@fitmirror/extension`).

## Decisions log (back-end lane)

Running list of defaults taken under the Working mode in CLAUDE.md. Each one is also recorded in the doc for its area.

### Step 1: M1 fixes (2026-10-17)
- "Tight beats loose" is defined as a ranking: overall verdict (good > loose > tight > unknown), then no tight critical dim, then score. See `fit-engine.md` § M1 fixes.
- Center-of-band tie-break uses the main dim (chest for top/outerwear/dress, waist for bottom); fit preference only breaks a remaining tie.
- The "no size fits well" warning still returns the closest size as `recommendedSize`; it doesn't null it out.
- Outerwear offset: chest +6, waist +6, shoulder +1 cm on garment charts only. Numbers are guesses, tunable in `fit-rules.ts`.

### Step 2: Profile (2026-10-17)
- Routes accept the cookie session or `Authorization: Bearer`. Bearer is what the extension will use after pairing, and what the live smoke test uses.
- One profile per user, enforced in code (the most recent row wins); no unique constraint, to avoid a migration.
- `PUT /api/profile` is the only route that signs a visitor in anonymously. It returns 503 with the reason if anonymous sign-in is disabled in Supabase Auth settings.
- Manual entry validates against plausible adult ranges (`HEIGHT_RANGE_CM`, `MEASUREMENT_RANGES_CM` in `fit-rules.ts`); out-of-range values are rejected as typos.
- Centimeters only in the form until question 8 is answered.
- Demo mode: `GET` serves `fixtures/profiles/demo.json`; `PUT` echoes the edits without saving.
- Middleware only refreshes the session when an `sb-` cookie exists and demo mode is off, so first visits and demos never wait on Supabase.
- `/studio` reads the profile (or the demo profile) and lists garments from the DB (fixtures in demo); `hardcoded-body.ts` is gone. `fixtures/` is traced into the server bundle for runtime reads on Vercel.

### Step 3: Fit API (2026-10-17)
- `POST /api/fit` needs a signed-in caller; another user's profile id returns 404 (RLS hides it), not 403, so ids don't leak.
- `GET /api/garments/:id` is public (shared catalog). Bad ids → 400, unknown → 404.
- Demo mode: `POST /api/fit?demo=1` only accepts the demo profile id and fixture garments.

### Step 4: Outfit API (2026-10-17)
- Slot rules live in `packages/shared/src/outfit-rules.ts` (pure, unit-tested) so the partner's client store and the server apply identical rules.
- Responses return `removed: OutfitEntry[]` instead of a single `replacedGarmentId`, since adding a dress can replace two items.
- An omitted `size` defaults to the fit engine's recommended size; a size not in the garment's chart is a 400.
- Removing `top` or `bottom` while a dress is worn removes the dress (the dress fills both slots).
- Layer position: dress/top 0, bottom 1, outerwear 2.
- Writes are a delete-then-upsert diff, not a transaction (supabase-js has none). The client reverts its optimistic state on an error, per outfit-editing.md.
- Demo mode: outfit routes return 409; the client keeps outfits locally with the shared rules.
- Each response includes `fits` per slot and an outfit-level `summary` ("Top fits, bottom is tight at the waist.").

### Step 5: Try-on pipeline (2026-10-17)
- Chain seed is the model photo path or `profile:<id>`; each layer gets its own render row so prefixes are cache hits. Details in `tryon.md` § Implementation.
- Queue runs with Next's `after()` (in-process, no external queue service). Stale in-flight rows (>2 min) and failed rows are requeued.
- `garmentIds` takes 1–3 garments, one per slot (same clash rules as outfits); an empty outfit is the client showing the bare model photo, not a render.
- Mock person image is the placeholder; a real provider requires a model photo (409) and product images (422).
- `ReplicateTryOn` is written but untested (no key); Gemini isn't implemented and throws if selected.
- Try-on on Vercel needs `SUPABASE_SERVICE_ROLE_KEY`, which is on hold until M2 (ingest). Until then the deployed route returns 503 outside demo mode.

### Step 6: Ingest API (2026-10-17)
- `LLM_PROVIDER` (`mock` default | `anthropic`) gates the LLM, mirroring `TRYON_PROVIDER`, so having an API key in the env never triggers spend by itself.
- The mock normalizer is a real deterministic DOM path (JSON-LD + table parser), not a stub, so ingest works offline and in demos. It refuses to guess a chart's unit.
- LLM model defaults to `claude-opus-5-5` when `LLM_MODEL` is unset. No server-side refusal fallback is configured; a refusal returns 502 and the caller can retry or use the manual form.
- Ingest is unauthenticated (shared catalog) but rate-limited per IP in memory; per-instance limits are acceptable for the hackathon.
- URL canonicalization keeps variant query params (e.g. `color`) and drops tracking params, so different colorways stay separate garments.
- Screenshot ingest returns 501; the vision fallback is not built.
- Ingest needs `SUPABASE_SERVICE_ROLE_KEY` on Vercel (planned for M2, per the earlier decision to hold it).

### fal try-on and model photo (2026-10-17)
- Head location runs in the browser (MediaPipe Pose, already in the stack for M4) and only the box is sent; the server does the blur, so the faceless copy exists before any provider call. No pose → top 22% of the photo is blurred, and the UI says so.
- Two stored objects per photo (`original.jpg`, `faceless.jpg`); the owner sees the original, providers get the faceless copy. Replacing or deleting a photo removes both.
- `TRYON_PROVIDER=fal` without `FAL_KEY` falls back to the mock with a warning instead of failing; Replicate now behaves the same way.
- Render limit is per profile per rolling 24 h, counting real-provider layer renders (default 20, `TRYON_DAILY_LIMIT`).
- Photo upload, try-on and ingest all need `SUPABASE_SERVICE_ROLE_KEY` on the server.
- `/studio` gained a try-on panel beside the fit panel (partner's area; kept minimal per the explicit request): model photo, render of the selected garment, skeleton while running, and a "the render shows the look, not the size" note.
- Placeholder fixtures have no product images, so the smoke test takes `--garment-image`.
- Not built yet: the "Delete my data" button (privacy doc) should also remove model photos and renders from storage.

### Merging the extension try-on prototype (2026-10-17)
- `Try-on-with-api-works` (extension photo, live fal try-on, outline figure, studio redesign, `/shop`) is merged on top of `fal-tryon` as `integrate-tryon`.
- `/studio` takes the prototype's page (studio UI is the partner's area). `StudioView`, `TryOnView` and `FitPanel` stay in `components/` for the partner to place.
- Both branches had created `/api/tryon`. The spec'd route (session, outfit, render cache, budget) keeps the path; the prototype's route moved to `/api/tryon/direct`, and the extension's background script now calls that path (a one-line change in the extension).
- One fal code path: the prototype's `lib/tryon/fashn.ts` was replaced by `FalTryOn.renderImages`, which takes over its tested request settings (`moderation_level: permissive`, `segmentation_free: true`, PNG output).
- The direct route is off in production unless `TRYON_DIRECT_ENABLED=true`; see `docs/tryon.md`.
- Removed the accidental `LitFits_DubHacks` gitlink (a nested-repo pointer with no `.gitmodules`).
- Fixed one lint error in `lib/opencv/extract-silhouette.ts` (an unused initial value). The prototype's files are not Prettier-formatted; left as is to avoid conflicts with the partner's in-flight work.
- Open, needs the partner: the extension has no Supabase session and captures no size chart, so it can't use `/api/fit` yet; the prototype adds `footwear`/`accessory`, which the shared schema doesn't have; `DesignDoc.md` duplicates `docs/`.

### Direct fit for the extension (2026-10-17)
- `POST /api/fit/direct` runs the fit engine on a request-supplied body and chart, so the session-less extension can show a size before the Supabase session work. No auth, nothing stored or logged; per-IP limit 60/min (in memory). Measurements are validated against the same ranges as `PUT /api/profile`.
- `garmentId` in the result is stable per product page (same derivation as demo-mode ingest, from the canonical URL), or per chart when no URL is given.
- The size-chart parser moved from `apps/web/lib/ingest/parse-chart.ts` to `packages/shared/src/size-chart.ts`, with `classifyFit`/`classifyStretch`, so the extension's content script uses the same parser as ingest. New: `findSizeChart` (first table on a page that parses; tries the heading text just before each table for the unit) and `fitGarmentFromPage` (builds the `/api/fit/direct` garment; null for footwear/accessory or without a chart).
- The extension's page snapshot now includes the page's tables (style/class/script removed, 20,000 chars) and the text around them; `PageProduct.fitGarment` carries the result. No UI change. `/api/products/extract` returns the same `fitGarment` from the fetched HTML.
- Limit: size guides that load only after a click (fetched by JavaScript) aren't in the DOM or the fetched HTML, so `fitGarment` is null there; the extension can re-extract after the guide opens.

