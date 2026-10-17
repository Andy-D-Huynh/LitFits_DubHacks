# Studio UI

Spec section 11.

## Pages

- **`/studio`**
  - Left column: the closet (ingested items, import dialog with paste URL or screenshot upload).
  - Center: figure viewport with tabs **Try-on photo** and **3D fit**.
  - Right: fit panel (size picker, per-size verdicts, explanations, alternatives) and the outfit tray.
  - Clicking a worn item on the figure or in the tray opens the edit popover (see `outfit-editing.md`, flow E).
- **`/compare`**: two or three saved outfits side by side with fit verdicts, total price, and per-item size.
- **`/checkout`**: cart grouped by retailer with deep links and the payment step.
- **`/onboarding`** and **`/capture/[sessionId]`**: see `outfit-editing.md` flow A and `measurement.md`.
- **`/embed`**: figure + fit panel for the extension side panel, authenticated by the pairing token (see `ingestion-extension.md`).

## Components

`FigureViewport`, `FitPanel`, `SizePicker`, `OutfitTray`, `ImportDialog`, `CompareGrid`, `CartByRetailer`, `MeasurementEditor`, `ConfidenceBadge`.

## State

- Zustand for the studio session (including the outfit store with undo history).
- TanStack Query for server data.
- Use skeletons and optimistic updates so nothing feels stuck.

## 3D figure (tier 2)

- Load a free CC0 rigged mannequin GLB with named body segments.
- Scale overall height from `height_cm`. Scale torso, waist, and hip segments from the ratio of user measurement to the mannequin's base value (morph targets if present, otherwise per-segment scale).
- Fit heatmap tints segments from the selected garment and size: **green** good, **amber** slightly snug or loose, **red** tight, **blue** loose.
- OrbitControls with an autorotate toggle and a slow idle breathing animation.
- Garment proxy meshes are a stretch goal; the heatmap is the committed feature.
