# Fit engine (`packages/shared/src/fit-engine.ts`)

Spec section 7. Pure, deterministic, fully unit-tested. All numbers live in `fit-rules.ts` so they are tunable.

## Normalize first

- If `measurement_basis` is `flat`, multiply chest, waist, hip by 2 (pit-to-pit style widths).
- Convert inches to cm at ingestion, never in the LLM.

## Garment charts (garment measurements)

Ease = garment dim − body dim, in cm of circumference. Starting targets:

| Dim | slim | regular | relaxed |
|---|---|---|---|
| Top chest ease | 4 to 8 | 8 to 16 | 16 to 26 |
| Top waist ease | 2 to 8 | 6 to 18 | 14 to 28 |
| Top shoulder ease | −2 to 2 | −1 to 3 | −1 to 8 (drop shoulder) |
| Bottom hip ease | 2 to 6 | 4 to 10 | 10 to 20 |

- Bottom waist ease: 0 to 4 (stretch: −4 to 2).
- Bottom inseam: garment inseam − body inseam from −3 to 3.
- High stretch lowers every minimum ease by 5 cm; low stretch by 2 cm.

## Body charts (body ranges)

- Body dim inside the range → `good`. Below the range → `loose`. Above → `tight`.
- If the user falls between two sizes on any critical dim, recommend per `fit_preference` (snug picks the smaller, otherwise the larger) and add a between-sizes warning.

## Scoring

- Per dim: `1.0` if inside the target band, else `max(0, 1 - distanceOutsideBand / 10)`.
- Weights:
  - Top: chest 0.5, shoulder 0.25, waist 0.1, renormalized to sum to 1 (≈ 0.588, 0.294, 0.118). **Length is excluded from scoring** because no body measurement corresponds to it.
  - Bottom: waist 0.4, hip 0.35, inseam 0.25
- **Sleeve is note-only:** it gets a `DimResult` with a verdict and note when both values exist, but no score weight.- Overall verdict:
  - `tight` if any critical dim (chest, waist, hip) is more than 3 cm below its minimum ease
  - `loose` if the main dim exceeds its maximum by more than 6 cm
  - else `good` if score ≥ 0.8
- Recommended size: highest score, ties broken by `fit_preference`. Return `null` with a warning if fewer than two critical dims could be evaluated.

## Confidence

- `high`: only if the chart is garment-type, `extraction_method` is `dom` or `fixture`, and all critical body dims are manual.
- `medium`: body dims came from photos.
- `low`: chart came from vision LLM, or key dims are missing.

## Explanations (mandatory)

Every dim result carries a human-readable note, e.g. "Chest: 6 cm of ease, target for relaxed fit is 16 to 26, so tight." The UI shows these strings verbatim.

## Tests

At least 20 vitest unit tests covering both chart types, flat vs circumference, stretch, between-sizes, and missing dims.
