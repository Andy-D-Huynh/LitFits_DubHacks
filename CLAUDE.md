# FitMirror

A personal fit-and-look layer for online clothes shopping (DubHacks '26, working name). The user enters or scans their body once. Then, on any store's product page, they click **Add to figure** and see (a) which size fits them and why, and (b) what the piece looks like on them.

FitMirror answers *does it fit* first, using the retailer's real size chart against the user's measurements. It answers *how does it look* second. The fit verdict comes from the fit engine, never from the try-on image.

## Rules (always follow)

- Build in the order of `docs/build-plan.md`. Do not add features outside the tier list below.
- TypeScript everywhere, strict mode. Validate every external input (API bodies, LLM output, scraped data) with zod.
- Every external dependency (try-on model, LLM, payments, messaging) sits behind an interface with a Mock implementation, so the demo never depends on a live third party.
- Unit-test the fit engine and the measurement math with vitest before building UI on top of them.
- Never send user body data or photos to the LLM. The LLM only ever sees product pages.
- The product must work end to end in demo mode (fixtures plus precomputed renders) with no network.
- If something is ambiguous, ask. Do not invent behavior.

## Scope

**Tier 1 (must work, demo-critical):** manual body profile · Chrome extension "Add to figure" with product and size chart extraction · ingestion API with LLM normalization and fixtures fallback · deterministic fit engine with per-size verdicts and explanations · Studio (figure viewport, fit panel, outfit tray) · outfit editing (add/remove/swap/change size, with undo) · cached 2D try-on render.

**Tier 2 (should work):** phone capture via QR with in-browser pose estimation · 3D mannequin with fit heatmap · saved outfits and compare · cart by retailer plus VISA sandbox checkout · fits-you-better alternatives.

**Tier 3 (only after tier 1 and 2 checkpoints pass):** Photon messaging agent · auto add-to-cart adapters · face-in-figure, polish, rewards, vibe matching.

**Out of scope:** arbitrary-store cheaper-alternative search, loyalty rewards, true 3D cloth simulation.

Full detail: `docs/product.md`.

## Stack

- Monorepo, pnpm workspaces
- `apps/web`: Next.js 15 (App Router), Tailwind, shadcn/ui, Zustand, TanStack Query, react-three-fiber + drei
- `apps/extension`: Chrome Manifest V3, Vite + CRXJS, React side panel
- Backend: Next.js route handlers only, no separate Python service
- Data: Supabase (Postgres, private Storage, Realtime)
- Pose and segmentation: `@mediapipe/tasks-vision`, run in the phone browser
- LLM (extraction only): Anthropic API, model name from env
- `packages/shared`: types, zod schemas, fit engine, fit rules, units, measurement math. Used by web and extension.

Layout and data model: `docs/architecture.md`.

## Commands

<!-- Fill in after M0 scaffolding. -->
- Dev: `TODO`
- Test: `TODO` (vitest)
- Demo mode: `DEMO_MODE=true` env, or `?demo=1` in the URL

## Current status

- Milestone: **M0** (not started)
- Open questions in `docs/build-plan.md` section 18: **unanswered**, so the defaults in the docs apply.

## Source of truth

Once code exists, code wins over docs: `packages/shared/src/types.ts`, `schemas.ts`, and the SQL migrations are canonical. When a decision changes, update the relevant doc in the same change.

## Docs index (read the relevant file before working on that area)

| File | Covers |
|---|---|
| `docs/product.md` | Pitch, honest limits, full scope tiers, demo plan |
| `docs/architecture.md` | System diagram, repo layout, data model, shared types, API routes, env vars |
| `docs/outfit-editing.md` | Core flows A–E, slot rules, click-to-edit, swap picker, render/fit updates |
| `docs/fit-engine.md` | Fit engine algorithm, ease targets, scoring, confidence |
| `docs/measurement.md` | Phone capture protocol and measurement estimation |
| `docs/ingestion-extension.md` | Product extraction, LLM normalization, fixtures, Chrome extension |
| `docs/tryon.md` | Try-on providers, layering, cache keys |
| `docs/ui.md` | Studio, compare, checkout pages, components, 3D figure |
| `docs/checkout-privacy.md` | Payment provider, VISA sandbox, privacy and security |
| `docs/build-plan.md` | Milestones, acceptance criteria, open questions |
