
# FitMirror

**A personal fit-and-look layer for online clothes shopping.**

FitMirror helps users determine which clothing size fits their body before visualizing how the garment looks on them. Users create a body profile once, then import clothing from online retailers through a Chrome extension to receive deterministic size recommendations, fit explanations, and virtual try-on renders.

Unlike try-on applications that focus exclusively on appearance, FitMirror evaluates fit using the retailer's actual size chart and the user's measurements before presenting the visual result.

## Table of Contents

- [1. Product Overview](#1-product-overview)
- [2. Scope and Priorities](#2-scope-and-priorities)
- [3. Architecture](#3-architecture)
- [4. Core User Flows](#4-core-user-flows)
- [5. Data Model](#5-data-model)
- [6. API Specification](#6-api-specification)
- [7. Fit Engine](#7-fit-engine)
- [8. Measurement Estimation](#8-measurement-estimation)
- [9. Garment Ingestion](#9-garment-ingestion)
- [10. Virtual Try-On](#10-virtual-try-on)
- [11. Studio UI](#11-studio-ui)
- [12. Chrome Extension](#12-chrome-extension)
- [13. Checkout and Visa Integration](#13-checkout-and-visa-integration)
- [14. Privacy and Security](#14-privacy-and-security)
- [15. Build Plan and Milestones](#15-build-plan-and-milestones)
- [16. Demo Plan](#16-demo-plan)
- [17. Environment Variables](#17-environment-variables)
- [18. Open Questions](#18-open-questions)

---

## 1. Product Overview

### The Core Experience

1. Create a body profile through manual measurements or phone-based capture.
2. Browse any supported retailer's product page.
3. Click **Add to Figure** in the Chrome extension.
4. Extract the product information and size chart.
5. Calculate the best-fitting size and explain why each size fits or does not fit.
6. Generate a virtual try-on image.
7. Add, remove, or swap garments to build an outfit.
8. Compare outfits and proceed through a sandbox checkout.

The browser extension reads the product page the user is already viewing, reducing the need for a centralized retailer scraper.

### Honest Product Limitations

These limitations must be reflected in the UI and product pitch.

- **Measurement accuracy:** Photo-based measurements are approximate, with an expected error of around ±3 cm. Manual measurements always take precedence.
- **Fit versus appearance:** The fit verdict is computed by the fit engine, not inferred from the try-on image.
- **3D representation:** Deferred for the hackathon. Current figure is an OpenCV border-line outline of the user (persistent side dock) that can wear garments in real time. A parametric 3D mannequin with fit heatmap remains a later upgrade.
- **Fit versus style:** A garment that fits correctly is not necessarily flattering. Fit and appearance are separate signals.
- **Checkout:** A single real-world purchase across multiple retailers requires merchant integrations. The hackathon checkout uses a sandbox.

---

## 2. Scope and Priorities

Features must be implemented in the order specified below. Do not add features outside these tiers.

### Tier 1: Must Work

1. Body profile with editable height and manual measurements.
2. Chrome extension that extracts product information and size charts.
3. Ingestion API with LLM normalization and fixture fallbacks.
4. Deterministic fit engine with per-size verdicts and explanations.
5. Studio web app with figure viewport, fit panel, and outfit tray.
6. Outfit editing: add, remove, swap, change size, undo, and redo.
7. Cached 2D virtual try-on renders using the user's model photo.

### Tier 2: Should Work

8. Phone capture through QR handoff and in-browser pose estimation.
9. Rotatable 3D mannequin with fit heatmap.
10. Saved outfits and side-by-side comparisons.
11. Cart grouped by retailer, deep links, and Visa sandbox checkout.
12. Better-fitting alternatives selected from already-ingested garments.

### Tier 3: Stretch Goals

13. Photon messaging agent for outfit suggestions and restock alerts.
14. Automatic add-to-cart adapters for two allowlisted retailers.
15. Optional face inclusion, animation polish, rewards, and outfit vibe matching.

### Explicitly Out of Scope

- Searching arbitrary stores for cheaper alternatives.
- Loyalty rewards.
- True 3D cloth simulation.

---

## 3. Architecture

### System Overview

```text
[Phone Browser: /capture/:sessionId]
              |
              | Pose estimation and profile capture
              v
          [Supabase]
              ^
              | Realtime synchronization
              |
[Next.js Application: UI + Route Handlers]
              ^
              |
[Chrome MV3 Extension]
  - Content script
  - Side panel
  - Product extraction
              |
              | POST /api/garments/ingest
              v
       [Ingestion API]
              |
              +----> LLM API (product extraction only)
              |
              +----> TryOnProvider
              |        - Replicate
              |        - Gemini
              |        - Mock
              |
              +----> PaymentProvider
              |        - Visa sandbox
              |        - Mock
              |
              +----> MessagingChannel
                       - Photon
                       - Mock
```

### Technology Stack

| Area | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Web application | Next.js 15 App Router, TypeScript |
| Styling | Tailwind CSS, shadcn/ui |
| Client state | Zustand |
| Server state | TanStack Query |
| Database | Supabase Postgres |
| Storage | Private Supabase Storage buckets |
| Realtime | Supabase Realtime |
| 3D rendering | React Three Fiber, Drei |
| Browser extension | Chrome Manifest V3, Vite, CRXJS |
| Pose estimation | MediaPipe Tasks Vision |
| Backend | Next.js route handlers |
| LLM extraction | Anthropic API |
| Shared logic | TypeScript, Zod, Vitest |

### Repository Layout

```text
fitmirror/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── (studio)/studio/page.tsx
│   │   │   ├── onboarding/page.tsx
│   │   │   ├── capture/[sessionId]/page.tsx
│   │   │   ├── compare/page.tsx
│   │   │   ├── checkout/page.tsx
│   │   │   └── api/
│   │   └── lib/
│   │       └── providers/
│   │           ├── tryon/
│   │           ├── payment/
│   │           └── messaging/
│   └── extension/
│       └── src/
│           ├── content/
│           ├── sidepanel/
│           └── background/
├── packages/
│   └── shared/
│       └── src/
│           ├── types.ts
│           ├── schemas.ts
│           ├── fit-engine.ts
│           ├── fit-rules.ts
│           ├── units.ts
│           └── measure.ts
├── fixtures/
│   ├── garments/
│   └── renders/
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

### Engineering Rules

- Use TypeScript with strict mode throughout the project.
- Validate external inputs, including API bodies, LLM responses, and scraped product data, with Zod.
- Place every external dependency behind an interface with a mock implementation.
- Ensure demo mode works offline using fixtures and precomputed renders.
- Unit-test measurement math and the fit engine with Vitest before building dependent UI.
- Never send user measurements, body data, or photos to the LLM.
- Ask for clarification when a requirement is ambiguous rather than inventing behavior.

---

## 4. Core User Flows

### A. Onboarding

1. Enter height and preferred units.
2. Choose manual measurement entry or phone-based capture.
3. Review measurements and confidence badges.
4. Edit any measurement.
5. Save the body profile.

Manual edits override photo-derived measurements and update their source to `manual`.

### B. Add to Figure

1. The user visits a supported retailer's product page.
2. The extension detects the product and displays a floating **Add to Figure** button.
3. The content script extracts product metadata, images, and the size chart.
4. The extension sends the data to the ingestion API.
5. The side panel displays the fit verdict.
6. A try-on render is retrieved from cache or queued for generation.

The size verdict must remain available independently of the image-generation provider.

### C. Compare and Decide

- Add garments to an outfit.
- Review each item's recommended size and fit explanation.
- Save outfits.
- Compare two or three outfits side by side, including prices and fit verdicts.

### D. Checkout

- Group cart items by retailer.
- Display the selected size and retailer deep link for every item.
- Create one demo order for the outfit.
- Confirm payment through the configured payment provider.
- Display simulated fulfillment status for each retailer line.

### E. Edit the Outfit

One outfit state is shared by the studio, extension side panel, and product-page experience.

Supported operations:

- Add garment.
- Remove garment.
- Swap garment.
- Change size.
- Undo.
- Redo.

No edit may reset unrelated outfit items.

#### Slot Rules

Valid garment categories and outfit slots:

- `top`
- `bottom`
- `outerwear`
- `dress`

A dress occupies both the top and bottom slots.

Layer order:

1. Top or dress.
2. Bottom.
3. Outerwear.

Rules:

- Adding an item to an empty slot fills that slot.
- Adding an item to an occupied slot replaces the existing item.
- Replacements show a toast identifying the removed item and offering Undo.
- Adding a dress while a top or bottom is worn removes both.
- Adding a top or bottom while a dress is worn removes the dress.
- Changing size keeps the same garment and slot.
- Removing a dress clears both the top and bottom slots.
- An empty outfit displays the bare model photo and mannequin.

#### Undo and Redo

Maintain a client-side history of the last 20 operations.

Undo and redo are accessible through:

- Toast actions.
- `Ctrl+Z` or `Cmd+Z`.
- Outfit tray controls.

Updates are optimistic. If a server write fails, revert the local change and display an error toast.

### Click-to-Edit Interaction

Clicking a worn garment on the try-on image, 3D mannequin, outfit tray, or saved outfit opens a shared edit popover with:

- Swap.
- Change size.
- Remove.
- Open on retailer site.

#### Try-On Image Hit Zones

Calculate hit zones once from pose landmarks during capture.

- Top: shoulders to hips, widened according to shoulder width.
- Bottom: hips to ankles.
- Outerwear: top zone plus arms.

Outerwear takes precedence where zones overlap.

Hovering a zone outlines it to indicate that it is interactive. Outfit tray chips remain usable even if hit-zone detection fails.

Per-layer human-parsing masks are a future upgrade.

#### 3D Hit Zones

Raycast against named mannequin segments.

- Torso and arms map to top or outerwear.
- Hips and legs map to bottom.

### Swap Picker

The swap picker opens the closet filtered to the selected category.

Each candidate displays:

- Brand and garment name.
- Recommended size.
- Fit verdict.
- Fit score.
- Price.

Candidates are sorted by fit score by default, with price sorting as an alternative. The picker includes garments imported through the extension and local fixtures.

Hovering or focusing a candidate previews it in the outfit tray without triggering a render. Selecting a candidate commits the swap.

If the resulting outfit is cached, display the cached render immediately.

Tier 2 alternatives that fit better appear at the top of the picker.

### Updating the Fit Panel and Try-On

- Fit verdicts update synchronously because the fit engine is pure.
- Show the nearest cached render immediately after an edit.
- Overlay a skeleton on the changed region while the new render is generated.
- Never blank the figure while rendering.
- Discard stale render results by comparing their cache-chain key with the current outfit key.

The fit panel lists each garment, its selected size, its verdict, and its explanation.

Also display an outfit-level summary, for example:

> Top fits; bottom is tight at the waist.

Each layer's cache key depends on the previous layer's key. An edit rerenders only the changed layer and layers above it. Removing the topmost layer should be a cache hit when the remaining outfit is already cached.

---

## 5. Data Model

The following schema is the initial relational model. Add ownership constraints, indexes, and migration files as part of implementation.

```sql
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  height_cm numeric not null,
  fit_preference text default 'regular',
  measurements jsonb not null,
  measurement_source jsonb,
  confidence jsonb,
  model_photo_path text,
  face_opt_in boolean default false,
  created_at timestamptz default now()
);

create table garments (
  id uuid primary key default gen_random_uuid(),
  source_url text unique,
  retailer text,
  brand text,
  name text,
  category text not null,
  image_urls text[],
  primary_image_url text,
  primary_color text,
  price_cents int,
  currency text,
  fit_type text,
  stretch text default 'none',
  chart_type text,
  measurement_basis text,
  size_chart jsonb,
  extraction_method text,
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
  slot text not null,
  position int,
  primary key (outfit_id, slot)
);

create table tryon_renders (
  id uuid primary key default gen_random_uuid(),
  cache_key text unique not null,
  profile_id uuid references profiles,
  garment_ids uuid[],
  status text default 'queued',
  provider text,
  image_path text,
  error text,
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
  profile_id uuid,
  outfit_id uuid,
  status text,
  total_cents int,
  payment_provider text,
  payment_ref text,
  created_at timestamptz default now()
);

create table order_lines (
  order_id uuid references orders,
  garment_id uuid references garments,
  size text,
  retailer text,
  price_cents int,
  status text
);
```

### Data Model Requirements

- Enable Row-Level Security on all user-owned tables.
- Enforce authorization through the authenticated user's ownership of the profile and associated resources.
- Treat `outfit_items.slot` as unique within an outfit.
- A dress occupies the top and bottom slots logically, even though the database stores a single dress item. Implement this consistently in the shared outfit logic and persistence layer.
- Use migrations for schema changes.
- Validate category, slot, measurement, and status values.
- Protect against concurrent outfit edits and duplicate order confirmations.

### Shared Types

```ts
export type Dim =
  | 'shoulder'
  | 'chest'
  | 'waist'
  | 'hip'
  | 'inseam'
  | 'length'
  | 'sleeve';

export type SizeRow = {
  label: string;
} & Partial<Record<Dim, number | [number, number]>>;

export type SizeChart = {
  unit: 'cm';
  rows: SizeRow[];
};

export type FitVerdict = 'tight' | 'good' | 'loose' | 'unknown';

export type DimResult = {
  dim: Dim;
  bodyCm: number;
  garmentCm?: number;
  rangeCm?: [number, number];
  easeCm?: number;
  verdict: FitVerdict;
  note: string;
};

export type SizeResult = {
  size: string;
  overall: FitVerdict;
  score: number;
  dims: DimResult[];
};

export type FitResult = {
  garmentId: string;
  recommendedSize: string | null;
  confidence: 'high' | 'medium' | 'low';
  perSize: SizeResult[];
  warnings: string[];
};
```

---

## 6. API Specification

All API request bodies and external responses must be validated with Zod. Enforce authentication, authorization, input limits, and rate limits where appropriate.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/capture-sessions` | Create a capture session and return its ID and QR URL. |
| `POST` | `/api/capture-sessions/:id/complete` | Submit measurements, confidence values, height, and model-photo path. Broadcast completion through Realtime. |
| `PUT` | `/api/profile` | Create or update the authenticated user's profile. Manual edits set the measurement source to `manual`. |
| `POST` | `/api/garments/ingest` | Ingest and normalize garment data. |
| `GET` | `/api/garments/:id` | Retrieve garment details. |
| `POST` | `/api/fit` | Calculate fit for a garment and profile. |
| `POST` | `/api/tryon` | Create or retrieve a cached try-on render. |
| `GET` | `/api/tryon/:id` | Retrieve render status and a signed image URL. |
| `GET` | `/api/alternatives?garmentId=&profileId=` | Find better-fitting ingested garments in the same category. |
| `POST` | `/api/checkout/session` | Create an order and payment session. |
| `POST` | `/api/checkout/:id/confirm` | Confirm the payment session. |

Implement CRUD operations for `/api/outfits`, including the following item routes.

### Add Outfit Item

`POST /api/outfits/:id/items`

Request:

```json
{
  "garmentId": "uuid",
  "size": "M"
}
```

Behavior:

- Add the garment to its category slot.
- If the slot is occupied, replace the existing item.
- Return the updated outfit and `replacedGarmentId` when applicable.
- Handle dress conflicts with top and bottom slots.

### Swap or Change Size

`PATCH /api/outfits/:id/items/:slot`

Request:

```json
{
  "garmentId": "uuid",
  "size": "L"
}
```

Behavior:

- Replace the garment or change its selected size.
- Preserve the slot and layer position.
- Return the updated outfit and a `FitResult` for each item.

### Remove Outfit Item

`DELETE /api/outfits/:id/items/:slot`

Behavior:

- Remove the garment in the requested slot.
- Removing a dress clears both top and bottom occupancy.
- Return the updated outfit.

### Garment Ingestion Contract

`POST /api/garments/ingest`

Supported sources:

- `extension`
- `url`
- `screenshot`

Expected input fields include:

- `source`
- `url`
- `title`
- `jsonld`
- `imageUrls`
- `chartHtml`
- `pageText`, limited to 8,000 characters
- Optional screenshot path

The endpoint returns a normalized `Garment` record and is idempotent on `source_url`.

### Try-On Contract

The try-on API returns a render ID and status immediately. Cache hits return `done` immediately. Otherwise, the client polls for completion or subscribes to the render row through Realtime.

### Checkout Contract

Create an order with one order line per garment. Confirm payment once for the outfit, then track simulated fulfillment separately for each retailer line.

---

## 7. Fit Engine

**Location:** `packages/shared/src/fit-engine.ts`

The fit engine must be pure, deterministic, and independently testable. Keep all tunable thresholds in `fit-rules.ts`.

### Normalize Measurements

Normalize garment measurements before calculating fit.

- All internal measurements use centimeters.
- Convert inches to centimeters during ingestion, not in the LLM.
- If `measurement_basis` is `flat`, multiply chest, waist, and hip widths by two when converting to circumference.
- Do not double values already expressed as circumferences.
- Preserve whether the size chart describes body measurements or garment measurements.

### Garment Measurement Charts

For garment charts, calculate ease as:

`ease = garment circumference - body circumference`

All ease values are in centimeters.

#### Starting Ease Targets

| Category | Dimension | Fit type | Target ease |
|---|---|---|---|
| Top | Chest | Slim | 4–8 cm |
| Top | Chest | Regular | 8–16 cm |
| Top | Chest | Relaxed | 16–26 cm |
| Top | Waist | Slim | 2–8 cm |
| Top | Waist | Regular | 6–18 cm |
| Top | Waist | Relaxed | 14–28 cm |
| Top | Shoulder | Regular | -1–3 cm |
| Top | Shoulder | Relaxed | Up to 8 cm |
| Bottom | Waist | Standard | 0–4 cm |
| Bottom | Waist | Stretch | -4–2 cm |
| Bottom | Hip | Slim | 2–6 cm |
| Bottom | Hip | Regular | 4–10 cm |
| Bottom | Hip | Relaxed | 10–20 cm |
| Bottom | Inseam | All | -3–3 cm |

Shoulder ease and inseam require dimension-specific handling because their measurements are not circumferences.

Stretch adjustment:

- High stretch lowers minimum ease by 5 cm.
- Low stretch lowers minimum ease by 2 cm.
- No stretch applies no adjustment.

Apply stretch adjustments only to dimensions for which ease targets are defined.

### Body Measurement Charts

For body-range charts:

- Inside the specified range means `good`.
- Below the range means `loose`.
- Above the range means `tight`.

When the user falls between two sizes on a critical dimension:

- `snug` preference selects the smaller size.
- `regular` and `loose` preferences select the larger size.
- Add a `between-sizes` warning.

### Scoring

For each dimension:

- Score `1.0` when the value is inside its target band.
- Otherwise, score `max(0, 1 - distanceOutsideBand / 10)`.

Use the following weights.

| Category | Dimension | Weight |
|---|---|---:|
| Top | Chest | 0.50 |
| Top | Shoulder | 0.25 |
| Top | Length | 0.15 |
| Top | Waist | 0.10 |
| Bottom | Waist | 0.40 |
| Bottom | Hip | 0.35 |
| Bottom | Inseam | 0.25 |

Normalize the score over the dimensions that can actually be evaluated, rather than penalizing missing measurements as though they were poor fit.

### Overall Verdict

- `tight`: Any critical dimension (chest, waist, or hip) falls more than 3 cm below its minimum ease.
- `loose`: The main dimension exceeds its maximum target by more than 6 cm.
- `good`: Neither condition above applies and the score is at least 0.8.
- `unknown`: There is insufficient information for a reliable verdict.

Resolve conflicting conditions deterministically and document the precedence in `fit-rules.ts`.

### Recommended Size

- Select the size with the highest score.
- Break ties according to `fit_preference`.
- Return `null` and a warning if fewer than two critical dimensions can be evaluated.

### Confidence

- `high`: Garment-measurement chart, extraction method `dom` or `fixture`, and all critical body dimensions manually measured.
- `medium`: Body measurements include photo-derived values.
- `low`: Chart extracted using vision LLM or key dimensions are missing.

### Explanations

Every evaluated dimension must include a human-readable explanation. The UI displays these explanations verbatim.

Example:

> Chest: 6 cm of ease. The target for a relaxed fit is 16–26 cm, so this size is tight.

### Testing Requirements

Write at least 20 Vitest unit tests covering:

- Garment and body-range charts.
- Flat versus circumference measurements.
- Inch-to-centimeter conversion.
- Stretch adjustments.
- Fit preferences.
- Between-size cases.
- Missing dimensions.
- Confidence levels.
- Score normalization.
- Verdict precedence.
- Dress and bottom/top category-specific dimensions.

---

## 8. Measurement Estimation

**Location:** `packages/shared/src/measure.ts`

Measurement estimation runs in the phone browser using MediaPipe Pose Landmarker and Image Segmenter.

### Capture Protocol

Display the following instructions:

- Position the phone at hip height.
- Stand approximately 2–3 meters away.
- Use a plain background and good lighting.
- Wear fitted clothing.
- Stand in an A-pose with arms approximately 30 degrees from the body.
- Keep the entire body in frame.
- Capture one front photo and one side photo.

Reject and request a retake if any of the 33 pose landmarks has visibility below `0.5` or the person touches the frame edge.

### Estimation Algorithm

1. **Scale calibration**

   Calculate `height_px` as the vertical distance from the topmost to the lowest pixel of the person segmentation mask.

   ```text
   px_per_cm = height_px / height_cm
   ```

   Use the segmentation mask to locate the crown of the head, since pose landmarks may not include it.

2. **Body landmark levels**

   ```text
   torso_px = hip_landmark_y - shoulder_landmark_y

   chest_y = shoulder_y + 0.20 * torso_px
   waist_y = shoulder_y + 0.62 * torso_px
   hip_y = hip_landmark_y + 0.12 * torso_px
   ```

3. **Width estimation**

   At each level, measure the central connected run of the person mask containing the body midline. This is intended to exclude arms in the A-pose.

   Take the median width across a vertical band of ±1% of `height_px`.

4. **Depth estimation**

   Apply the same procedure to the side photo, using that photo's own scale calibration.

5. **Circumference estimation**

   Let `a = width / 2` and `b = depth / 2`.

   Approximate circumference using Ramanujan's ellipse formula:

   ```text
   C = π * (3(a + b) - sqrt((3a + b)(a + 3b)))
   ```

6. **Shoulder width**

   Measure the mask width at shoulder level and subtract a calibrated arm-inclusion correction.

7. **Inseam estimation**

   Scan upward from the knee to find the point where the segmentation mask splits into two leg runs. Use the crotch-to-ankle distance:

   ```text
   inseam = (ankle_y - crotch_y) / px_per_cm
   ```

8. **Calibration**

   Apply a global calibration factor per dimension, initially `1.0`. Keep the factors in `fit-rules.ts` and tune them using tape measurements from two teammates.

   Fitted clothing may add approximately 1–2 cm of apparent measurement.

### Validation and Output

Return:

- Estimated measurements.
- Per-measurement confidence.
- Measurement source.
- Warnings for implausible values or significant left-right mismatch.

Do not require waist to be smaller than hip or hip to be smaller than chest. Validate each dimension against reasonable adult ranges instead.

Display all estimates in an editable review screen.

### Privacy

Delete raw capture photos immediately after estimation unless the user explicitly opts to retain a model photo for try-on.

---

## 9. Garment Ingestion

The Chrome extension extracts product data from the active page. The server normalizes the result and uses fallbacks if necessary.

### Client-Side Extraction Order

1. **JSON-LD:** Find `@type: Product` data and extract name, brand, images, color, SKU, offer price, and currency.
2. **Metadata fallback:** Use OpenGraph and other relevant meta tags.
3. **Size chart extraction:** Find tables containing recognizable size labels, such as XS–XXL or numeric waist sizes.
4. **Size guide interaction:** If no chart is found, locate a button or link containing text such as "size guide" or "size chart," click it, wait 800 ms, and scan again.
5. **Images and text:** Collect up to eight image URLs and up to 8,000 characters of visible page text.
6. **Submission:** POST the extracted information to `/api/garments/ingest`.

Treat retailer page content as untrusted input.

### Server-Side LLM Normalization

The LLM receives only extracted product information, chart HTML, and page text.

It must return structured JSON validated against a Zod schema.

The extraction contract requires the LLM to:

- Extract structured product data.
- Preserve the units as stated and provide a unit field.
- Return `null` for absent values.
- Never invent or infer missing measurements.
- Classify the chart as body measurements or garment measurements.
- Identify flat widths versus circumferences.
- Classify category, fit type, and stretch.
- Identify the cleanest product-only image.

Retry once if schema validation fails.

Convert units to centimeters in application code after normalization.

### Fallback Order

1. DOM extraction.
2. LLM normalization from HTML and page text.
3. Screenshot upload followed by vision-based extraction.
4. Manual entry form.
5. Local fixtures.

### Extraction Confidence

| Method | Starting confidence |
|---|---:|
| DOM with valid chart | 0.90 |
| LLM from HTML | 0.70 |
| LLM from vision | 0.60 |

These are extraction-confidence values, distinct from the fit engine's categorical confidence.

### Fixtures

Create eight verified garment fixtures across two or three retailers:

- Three tops.
- Three bottoms.
- One outerwear item.
- One optional dress, depending on the selected fixture count and demo scope.

Each fixture must include a verified size chart, garment metadata, and product imagery.

Demo mode loads fixtures using `?demo=1`.

---

## 10. Virtual Try-On

### Provider Interface

```ts
export interface TryOnProvider {
  render(input: {
    personImageUrl: string;
    garmentImageUrl: string;
    category: 'upper_body' | 'lower_body' | 'dresses';
    description: string;
  }): Promise<{
    imageUrl: string;
  }>;
}
```

### Implementations

- `ReplicateTryOn`: Uses an IDM-VTON-style model, configurable through environment variables.
- `GeminiImageTryOn`: Uses prompt-based image editing.
- `MockTryOn`: Returns precomputed images from `fixtures/renders`.

Demo mode defaults to `MockTryOn`.

All providers implement the same interface so the application does not depend on a particular vendor.

### Layered Rendering

Render the outfit sequentially:

1. Render the top onto the person image.
2. Feed the resulting image into the bottom render.
3. Feed that result into the outerwear render.

Handle dresses as a single garment occupying the top and bottom slots.

Each layer's cache key is derived from:

- The previous layer's key, or the original person-photo ID for the first layer.
- Garment image URL.
- Garment category.
- Provider identity.

Hash the canonicalized input using SHA-256.

Check the cache before invoking a provider.

An outfit edit should rerender only the changed layer and subsequent layers.

### Asynchronous Rendering

Typical external render time is approximately 10–40 seconds.

- Return a render ID and `queued` status immediately.
- Poll `GET /api/tryon/:id` every two seconds or subscribe through Realtime.
- Display a skeleton over the changed region.
- Preserve the nearest cached render while the new result is generated.
- Discard stale results when their chain key does not match the current outfit.

### Face Privacy

The default render excludes the face by cropping or blurring the head region using pose landmarks.

Include the face only after explicit opt-in.

The UI must state clearly:

> The try-on image illustrates garment design and color. It does not determine whether the garment fits. Fit recommendations are calculated separately from your measurements and the retailer's size chart.

---

## 11. Studio UI

### Routes

| Route | Purpose |
|---|---|
| `/studio` | Main closet, figure viewport, fit panel, and outfit tray |
| `/onboarding` | Profile creation and measurement review |
| `/capture/[sessionId]` | Phone-based measurement capture |
| `/compare` | Saved outfit comparisons |
| `/checkout` | Cart and sandbox payment flow |

### Studio Layout

The studio has three primary columns.

**Left: Closet**

- Ingested garments.
- Category filters.
- Import dialog.
- Paste-URL and screenshot-upload options.

**Center: Figure Viewport**

- Try-on photo tab.
- 3D fit tab.
- Clickable garment hit zones.
- Loading skeletons and cached renders.

**Right: Fit Panel and Outfit Tray**

- Selected size.
- Per-size verdicts.
- Dimension-level explanations.
- Better-fitting alternatives.
- Outfit items and edit actions.

### Components

- `FigureViewport`
- `FitPanel`
- `SizePicker`
- `OutfitTray`
- `ImportDialog`
- `CompareGrid`
- `CartByRetailer`
- `MeasurementEditor`
- `ConfidenceBadge`

### State Management

- Use Zustand for the current studio session and outfit operations.
- Use TanStack Query for server data.
- Keep the outfit state consistent across the studio and extension.
- Use optimistic updates and skeletons to keep the UI responsive.

### 3D Mannequin

**Tier 2 feature.**

Load a free CC0 rigged mannequin GLB with named body segments.

- Scale overall height using `height_cm`.
- Scale torso, waist, and hip segments using the ratio of user measurements to the mannequin's baseline.
- Prefer morph targets when available; otherwise, scale individual segments.
- Color segments according to the selected garment's fit verdict.
- Support OrbitControls and an autorotate toggle.
- Add a slow idle breathing animation.

Fit heatmap colors:

- Green: good.
- Amber: slightly snug or loose.
- Red: tight.
- Blue: loose.

The heatmap is the committed feature. Garment proxy meshes are a stretch goal.

---

## 12. Chrome Extension

### Platform

- Chrome Manifest V3.
- Vite and CRXJS.
- React side panel.
- Content script for product detection and extraction.

### Permissions

Request only the permissions required for the implemented features:

- `activeTab`
- `storage`
- `sidePanel`
- `scripting`

Use host permissions for explicitly allowlisted retailers. Support a generic content script that activates when valid Product JSON-LD is present, subject to Chrome's permission model.

### Pairing

1. The web app displays a six-digit pairing code.
2. The user enters the code in the extension side panel.
3. The server validates the code and issues a short-lived or revocable extension token.
4. The extension stores the token in `chrome.storage`.

Do not store user passwords in the extension. Avoid treating a six-digit code as a permanent authentication credential.

### Content Script

- Detect supported product pages.
- Display a floating **Add to Figure** button.
- Extract product data and size charts.
- Send the information to the ingestion API.
- Show success or failure feedback.
- If the relevant outfit slot is occupied, display **Swap into Outfit** and support undo.

### Side Panel

Display the same figure and fit panel as the studio through an authenticated `/embed` route.

The persistent side panel keeps the figure visible while the user browses different tabs.

Do not rely on third-party cookies or an unauthenticated iframe for session security.

### Tier 3: Retailer Cart Adapters

Implement adapters under:

```text
apps/extension/src/adapters/<retailer>.ts
```

Each adapter provides retailer-specific selectors for selecting a size and adding an item to the cart.

After the action, verify that the cart count increased.

If the action fails, show an explanatory message and open the product page for manual completion.

Only implement adapters for two allowlisted retailers after the core tiers pass.

---

## 13. Checkout and Visa Integration

### Payment Provider Interface

```ts
export interface PaymentProvider {
  createSession(order: Order): Promise<{
    clientData: unknown;
  }>;

  confirm(
    orderId: string,
    clientData: unknown
  ): Promise<{
    status: 'paid' | 'failed';
    ref: string;
  }>;
}
```

### Implementations

- `MockPayment`: Deterministic offline demo implementation.
- `VisaSandboxPayment`: Uses the actual Visa sandbox contract once the track's available APIs are confirmed.

### Checkout Flow

1. User confirms the outfit.
2. Create an order with one line per garment.
3. Create one payment session for the demo order.
4. Confirm payment through the provider.
5. Display simulated fulfillment status for each retailer line.
6. Show retailer deep links for completing actual purchases.

Never handle raw card numbers. Use tokenized credentials or provider-hosted payment fields in sandbox mode.

The demo must be explicit that one payment confirmation does not automatically purchase products from unrelated retailers.

The real-world multi-merchant flow requires merchant-specific checkout integrations. Tier 3 extension adapters demonstrate a possible path toward that experience.

---

## 14. Privacy and Security

### Data Protection

- Use private storage buckets.
- Issue signed URLs that expire after 10 minutes.
- Enable Row-Level Security on all user-owned tables.
- Strip EXIF metadata from uploaded images.
- Delete raw capture photos after measurement unless the user opts to retain a model photo.
- Exclude the face from try-on images by default.
- Provide a **Delete My Data** action that removes the user's profile, photos, renders, and orders according to the retention policy.

### Data Boundaries

- Never send user body data or photos to the LLM.
- Disclose that the try-on provider receives the user's model photo, cropped or blurred by default.
- Treat scraped page text as untrusted input.
- Never execute code or instructions returned by an LLM.
- Validate all external data with Zod.
- Rate-limit ingestion and other resource-intensive endpoints.
- Restrict provider credentials to server-side environment variables.
- Verify authorization for every resource access, including storage paths and render IDs.

### Authentication and Authorization

- Use Supabase authentication for the web application.
- Scope profile, outfit, render, and order access to the authenticated owner.
- Ensure users cannot access another user's photos or signed URLs.
- Keep service-role credentials on the server only.
- Make extension tokens revocable and restrict their permissions.

---

## 15. Build Plan and Milestones

The initial schedule assumes a roughly 36-hour hackathon with three or four team members. Adjust work allocation once the team size and event constraints are confirmed.

### M0: Foundation — Hours 0–2

- Initialize the pnpm monorepo.
- Set up the Next.js application.
- Configure Supabase and database migrations.
- Create shared types and Zod schemas.
- Load initial garment and render fixtures.
- Establish the mock provider interfaces.

**Checkpoint:** The project runs locally, and demo fixtures are accessible.

### M1: Fit Engine and Studio — Hours 2–10

- Implement manual profile entry and `MeasurementEditor`.
- Implement the fit engine and unit tests.
- Build the studio using fixture garments.
- Implement the fit panel and size explanations.
- Implement the outfit store.
- Support add, remove, swap, change size, undo, and redo.

**Checkpoint:** Select a fixture, receive a size verdict with explanations, and edit the outfit without losing other items.

### M2: Ingestion and Extension — Hours 2–14, Parallel

- Implement the ingestion API.
- Implement DOM extraction.
- Implement LLM normalization and validation.
- Implement the extension content script.
- Build the side panel.
- Add pairing and authentication.

**Checkpoint:** Click Add to Figure on a supported product page and create a garment record.

### M3: Try-On and 3D — Hours 10–20

- Implement the provider interfaces.
- Add mock renders and external provider adapters.
- Implement asynchronous rendering and caching.
- Build the figure viewport.
- Add the 3D mannequin and heatmap.

**Checkpoint:** A render appears next to the fit verdict. Swapping or removing an item rerenders only affected layers.

### M4: Phone Capture — Hours 14–22

- Implement capture sessions and QR handoff.
- Add MediaPipe pose estimation and segmentation.
- Implement measurement review and confidence indicators.
- Calibrate against tape measurements.

**Checkpoint:** Phone capture fills the profile and the user can correct estimated values.

### M5: Outfits, Compare, and Checkout — Hours 20–28

- Implement outfit persistence.
- Build compare view.
- Implement retailer-grouped cart.
- Integrate the Visa sandbox or mock fallback.
- Implement better-fitting alternatives.

**Checkpoint:** Save and compare outfits, then complete the sandbox checkout.

### Feature Freeze — Hour 28

Stop adding features. Prioritize correctness, demo reliability, and bug fixes.

### M6: Polish and Rehearsal — Hours 28–34

- Polish the UI.
- Verify offline demo mode.
- Prepare a recorded fallback video.
- Write the final setup documentation.
- Rehearse the demo and failure paths.

### M7: Stretch Goals

Proceed only if the acceptance criteria for Tiers 1 and 2 are satisfied.

Potential additions:

- Photon messaging.
- Retailer-specific add-to-cart adapters.
- Face-in-figure option.
- Additional animation polish.

### Acceptance Criteria

**Tier 1**

- Starting from a clean profile, a supported real product page produces a garment record, size verdict, and try-on image within 60 seconds under suitable provider conditions.
- Demo mode works without network access.
- The user can click a worn item and remove or swap it.
- Outfit edits preserve unrelated items.
- The fit panel updates immediately.
- Cached renders appear immediately when available.

**Tier 2**

- Phone capture fills the profile within approximately 30 seconds under suitable conditions.
- The compare view displays three outfits.
- Checkout completes in the sandbox or mock environment.

**Fit engine**

- At least 20 unit tests cover the required chart types, measurement normalization, stretch, between-size behavior, missing dimensions, confidence, and scoring.

---

## 16. Demo Plan

Target duration: three minutes.

### Step 1: Create a Profile

Scan the QR code with a phone or use a precaptured fallback.

Edit one measurement to demonstrate manual override.

### Step 2: Import a Garment

Open a supported retailer page and click **Add to Figure**.

Show a size recommendation and a dimension-level explanation.

Example:

> Size M fits. Size L is 6 cm too loose at the chest.

Display the try-on render beside the verdict.

### Step 3: Build an Outfit

Import a bottom from another retailer.

Click the top on the figure to swap it. Remove an item and undo the removal.

Save the outfit and compare it with an existing outfit.

### Step 4: Checkout

Group the cart by retailer and complete the Visa sandbox payment in one confirmation.

### Step 5: Optional Messaging

If Photon is integrated, show an outfit suggestion or restock alert.

### Demo Fallbacks

- Use fixtures when extraction fails.
- Use precomputed renders when a provider fails or is unavailable.
- Use a recorded video as the final fallback.
- Rehearse the failure path at least once.

---

## 17. Environment Variables

Configure the following variables in the local environment.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

ANTHROPIC_API_KEY=
LLM_MODEL=

TRYON_PROVIDER=mock
REPLICATE_API_TOKEN=
TRYON_MODEL=
GEMINI_API_KEY=

PAYMENT_PROVIDER=mock
# VISA_* variables depend on the actual sandbox documentation.

MESSAGING_PROVIDER=mock
# PHOTON_* variables depend on the actual messaging API.

DEMO_MODE=true
```

### Configuration Rules

- Keep service-role keys, LLM keys, payment credentials, and provider tokens server-side.
- Never expose secrets through `NEXT_PUBLIC_*` variables.
- Default to mock providers in demo mode.
- Validate required configuration at application startup.
- Do not require live credentials to run the offline demo.

---

## 18. Open Questions

These questions must be resolved before the corresponding implementation decisions are finalized. Until then, use the defaults in this document.

### 1. Team and Schedule

- How many team members are available?
- How long is the event?
- Who owns each workstream?

### 2. Visa Track

- What exactly does the Visa track prompt require?
- Which Visa APIs and sandboxes are available?
- Are there specific integration or judging requirements?

The payment implementation remains a placeholder until the real API contract is known.

### 3. Photon Integration

- What does Photon provide?
- Is there an API, channel, or sandbox?
- Is the messaging track confirmed or still undecided?

### 4. Try-On Provider

- Which provider is actually available: Replicate, Gemini, or another service?
- Are API keys already available?
- What are the provider's latency, privacy, and cost constraints?

### 5. Retailers

- Which two or three retailers should be used for the demo?
- Can their size charts and product imagery be verified?
- Which retailers should be allowlisted for the extension?

### 6. Garment Categories

- Are tops and bottoms sufficient for v1?
- Must dresses and shoes be supported?

The current data model supports tops, bottoms, outerwear, and dresses. Shoes are not included in the initial fit engine.

### 7. Extension Requirements

- Is a Chrome extension acceptable to the judges?
- Must the experience work entirely through a web app and phone?

### 8. Units

- Should the UI support metric units, imperial units, or both?

All internal calculations remain in centimeters regardless of the display preference.

---

## Definition of Done

FitMirror is ready for demonstration when:

- The repository installs and runs using the documented setup.
- Demo mode works without external network dependencies.
- A user can create and edit a body profile.
- A garment can be imported and normalized.
- The fit engine returns deterministic size recommendations with explanations.
- A try-on render appears alongside the fit verdict.
- Users can add, remove, swap, and resize garments without losing other outfit items.
- Undo and redo work reliably.
- Outfit state remains consistent between the studio and extension.
- Privacy, authentication, and authorization controls are enforced.
- The checkout demo completes through a mock or confirmed sandbox provider.
- The three-minute demonstration has been rehearsed, including fallback behavior.

**Product principle:** FitMirror must never present a visual approximation as proof of physical fit. Fit is calculated from measurements and size charts; appearance is communicated through try-on imagery.
