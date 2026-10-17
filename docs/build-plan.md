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
| **M3** | h10–20 | C: try-on providers, caching, queue, viewport; 3D mannequin with heatmap. | Render appears next to verdict; swapping or removing an item re-renders only the affected layers. |
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
   - Answer: _TODO_
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
