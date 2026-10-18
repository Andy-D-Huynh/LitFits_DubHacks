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
- **Sleeve is note-only:** it gets a `DimResult` with a verdict and note when both values exist, but no score weight.
- **Missing dims:** when a scored dim can't be evaluated for a size (absent from the chart or from the profile), renormalize the weights over the dims that were evaluated, and add an explanation line naming what wasn't checked, e.g. "Inseam not checked: the size chart has no inseam." Only scored dims count as missing; length and sleeve never do. The fewer-than-two-critical-dims rule below still applies.
- Overall verdict:
  - `tight` if any critical dim (chest, waist, hip) is more than 3 cm below its minimum ease
  - `loose` if the main dim exceeds its maximum by more than 6 cm
  - else `good` if score ≥ 0.8
- Recommended size: highest score, ties broken by `fit_preference`. Return `null` with a warning if fewer than two critical dims could be evaluated.

## Confidence

- `high`: only if the chart is garment-type, `extraction_method` is `dom` or `fixture`, and all critical body dims are manual.
- `medium`: body dims came from photos.
- `low`: chart came from vision LLM.
- Then drop one level (high → medium → low, floor at low) per missing scored dim for the recommended size.

## Explanations (mandatory)

Every dim result carries a human-readable note, e.g. "Chest: 6 cm of ease, target for relaxed fit is 16 to 26, so tight." The UI shows these strings verbatim.

## Tests

At least 20 vitest unit tests covering both chart types, flat vs circumference, stretch, between-sizes, and missing dims.

## Implementation decisions (M1, 2026-10-17)

Confirmed by the team:
- **Low score:** if neither the tight nor the loose rule fires and the score is below 0.8, the overall verdict is the direction of the dim losing the most weighted score (below its band → `tight`, above → `loose`).
- **Outerwear** uses the top bands and weights. **Dress** uses the top rules for chest, shoulder and waist plus the bottom hip band, weights chest 0.5, shoulder 0.25, waist 0.1, hip 0.35 (renormalized).
- **Critical-dim minimum:** tops and outerwear need chest; bottoms need two of waist/hip; dresses need two of chest/waist/hip. Otherwise the size can't be recommended.
- **Sleeve:** verdict `unknown`, with a factual note, e.g. "Sleeve: 64 cm vs your 61 cm arm length (+3 cm); not scored."

Defaults taken where the spec is silent (change here if wrong):
- **Stretch:** the min-ease reduction applies to every ease band (chest, waist, shoulder, hip) except the bottom waist and inseam. A stretch bottom waist (low or high) uses −4 to 2 instead of 0 to 4, with no further reduction.
- **Main dim** (loose rule) is the highest-weight dim: chest for top, outerwear and dress; waist for bottom.
- **Body charts** use the range as the band. Overall `tight` if a critical body dim is more than 3 cm above the range; `loose` if the main dim is more than 6 cm below it.
- **Between sizes** (body charts): a critical body dim lies strictly between one size's max and the next size's min. Rows are assumed smallest to largest. The first such dim in weight order decides, and both sizes must qualify.
- **Ties:** snug picks the smaller size, regular and loose the larger.
- **Confidence base** when no rule applies (e.g. body chart, manual dims): `medium`. A missing `measurement_source` entry counts as manual. No recommendation → `low`.
- **"Not checked" lines** go in `FitResult.warnings`, deduplicated across sizes.
- **Unknown inputs:** no chart or chart type → no recommendation. A garment chart with unknown basis → no recommendation, since flat vs circumference is a 2× difference. Unknown fit type → regular targets plus a warning.
- **Mixed values:** a range in a garment chart uses its midpoint; a single number in a body chart is a one-point range.
- **Length** produces no `DimResult` (no body measurement to compare).
