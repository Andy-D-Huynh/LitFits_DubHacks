# packages/shared

Shared by `apps/web` and `apps/extension`: types, zod schemas, fit engine, fit rules, unit conversion, measurement math.

- `schemas.ts` is canonical; `types.ts` only infers from it.
- `dims.ts` is the only place profile measurement keys map to chart dims. Use `bodyCmForDim`, never hard-code the mapping.

Before changing the fit engine, read `docs/fit-engine.md`. Before changing measurement estimation, read `docs/measurement.md`.

## Invariants

- `fit-engine.ts` is pure and deterministic. No I/O, no LLM, no randomness.
- Every tunable number (ease bands, weights, thresholds, calibration factors) lives in `fit-rules.ts`, not inline.
- All internal units are cm. Inches convert at ingestion, in code, never in the LLM.
- Explanation strings are mandatory and shown verbatim in the UI, e.g. "Chest: 6 cm of ease, target for relaxed fit is 16 to 26, so tight."
- Write tests (vitest) before UI depends on new behavior.

## Required test coverage (at least 20 tests)

Both chart types (body and garment) · flat vs circumference basis · stretch none/low/high · between-sizes with snug vs regular/loose preference · missing dims (fewer than two critical dims evaluated → null recommendation with warning).
