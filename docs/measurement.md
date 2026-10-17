# Measurement estimation (`packages/shared/src/measure.ts`, runs on the phone)

Spec section 8. Tier 2. Manual entry always overrides photo estimates (±3 cm).

## Capture protocol (show an on-screen guide)

- Phone propped at hip height, 2 to 3 m away; plain background; good light; fitted clothes.
- A-pose with arms about 30° from the body; full body in frame.
- Take one front photo and one side photo.
- Reject and reprompt if any of the 33 pose landmarks has visibility < 0.5, or the person touches the frame edge.

## Algorithm (MediaPipe Pose Landmarker + Image Segmenter, in the browser)

1. **Scale:** `height_px` = vertical distance from the topmost to the lowest pixel of the person mask. `px_per_cm = height_px / height_cm`. Use the mask for the crown of the head, since pose landmarks lack it.
2. **Levels:** with `torso_px = hip_y − shoulder_y` (landmarks):
   - `chest_y = shoulder_y + 0.20 * torso_px`
   - `waist_y = shoulder_y + 0.62 * torso_px`
   - `hip_y = hip_landmark_y + 0.12 * torso_px`
3. **Width at a level:** run-length of the mask at that y, taking the central connected run that contains the body midline (this excludes arms in A-pose). Take the median over a band of ±1% of `height_px`.
4. **Depth:** same procedure on the side photo, with its own `px_per_cm`.
5. **Circumference:** with `a = width/2`, `b = depth/2`: `C = π * (3(a+b) − sqrt((3a+b)(a+3b)))` (Ramanujan ellipse approximation).
6. **Shoulder width:** mask width at shoulder level, minus an arm-inclusion correction constant.
7. **Inseam:** scanning upward from the knee, find the y where the mask splits into two leg runs (crotch). `inseam = (ankle_y − crotch_y) / px_per_cm`.
8. **Calibration:** apply a global factor per dimension (starts at 1.0, lives in `fit-rules.ts`). Tune by measuring two teammates with a tape and adjusting. Clothing typically adds 1 to 2 cm.

## Output

- Values plus per-key confidence, then the editable review screen.
- Plausibility checks: waist < hip < chest is **not** required, but reject values outside normal adult ranges and warn on large left-right mismatch.

## Privacy default

Delete raw capture photos right after estimation. Keep only the model photo if the user opts in to try-on.
