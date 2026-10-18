# Try-on

Spec section 10.

## Interface

```ts
interface TryOnProvider {
  render(input: {
    personImageUrl: string;
    garmentImageUrl: string;
    category: 'upper_body' | 'lower_body' | 'dresses';
    description: string;
  }): Promise<{ imageUrl: string }>;
}
```

Implementations (in `apps/web/lib/providers/tryon/`):
- `ReplicateTryOn`: an IDM-VTON-style model, name from env (`TRYON_MODEL`).
- `GeminiImageTryOn`: prompt-based image editing.
- `MockTryOn`: returns precomputed images from `fixtures/renders/`. **Default in demo mode.**

## Layering

Outfits layer sequentially: render the top onto the person photo, then feed that output in as the person image for the bottom, and so on. Layer order: dress or top, then bottom, then outerwear.

## Cache keys

- Per layer: `sha256(previousLayerKey, garmentImageUrl, category, provider)`. For the first layer, `previousLayerKey` is the person photo id.
- Because keys chain, editing one layer re-renders only that layer and the layers above it.
- Check the cache before calling any provider.

## Async behavior

- Renders take 10 to 40 s. Return immediately with status `queued`; the client polls `GET /api/tryon/:id` every 2 s or subscribes to the row via Realtime, and shows a skeleton.
- Discard stale results by comparing chain keys (see `outfit-editing.md`).

## Privacy

- Faceless default: crop or blur the head region (from pose landmarks) before sending. Include the face only with explicit opt-in.
- Disclose that the try-on provider receives the head-cropped model photo.

## Known limitation (shown in UI)

The render does not reflect size. Always place it next to the fit panel, never alone.

## Implementation (step 5, 2026-10-17)

- Code: `apps/web/lib/tryon/pipeline.ts` (plan, chained keys, queue; storage and provider injected), `supabase-store.ts` (service-role writes), routes `POST /api/tryon` and `GET /api/tryon/:id`.
- First-layer seed (`previousLayerKey`): the model photo path, or `profile:<id>` when there's no photo yet, so keys never collide across users.
- Every layer is its own `tryon_renders` row keyed by its chain key, so a prefix of a rendered outfit (top layer removed) is a cache hit and a swap re-renders only that layer and above.
- Queue: `POST` returns the outfit's row (`done` → 200 with a signed image URL; otherwise 202) and processes after the response with Next's `after()`. Queued/running rows older than 2 minutes are requeued; failed rows are requeued on the next request.
- Providers: `MockTryOn` by default and always in demo mode (returns `fixtures/renders` matches, else `/tryon-placeholder.svg`). `ReplicateTryOn` only when `TRYON_PROVIDER=replicate` with `REPLICATE_API_TOKEN` and `TRYON_MODEL`; input names follow IDM-VTON and are untested without a key. Gemini is not implemented.
- A real provider needs a model photo (409 without one) and a product image for every garment (422). Its outputs are copied into the private `renders` bucket and served with 10-minute signed URLs; mock outputs are local public paths.
- Demo mode: `POST /api/tryon?demo=1` renders with the mock and returns the image directly (`renderId: null`), with no DB.
- Writing renders needs `SUPABASE_SERVICE_ROLE_KEY` on the server (503 without it), which is not yet set on Vercel.

## fal and the model photo (2026-10-17)

- **fal is the preferred real provider.** `FalTryOn` (`apps/web/lib/providers/tryon/fal.ts`) calls `fal-ai/fashn/tryon/v1.6` by default (override with `TRYON_MODEL`) through `@fal-ai/client`'s `createFalClient({ credentials: FAL_KEY })`. Input per fal's published schema: `model_image`, `garment_image`, `category` (`tops` | `bottoms` | `one-pieces`; outerwear → `tops`), `mode: balanced`, `garment_photo_type: auto`, `moderation_level: permissive`, `segmentation_free: true`, `output_format: png`, `num_samples: 1` (the last four as in the extension prototype, which was verified live). Output `images[0].url` is copied into the private `renders` bucket.
- **Selection** (`select.ts`): `TRYON_PROVIDER=fal` with `FAL_KEY` → fal; `replicate` with its token and model → Replicate; otherwise, and always in demo mode, the mock (with a one-time server warning when a selected provider lacks credentials).
- **Model photo** (`POST /api/profile/photo`): one full-body JPEG/PNG/WebP up to 10 MB. The server applies EXIF orientation, strips all metadata, caps the long edge at 2048 px and stores two private objects: `original.jpg` (shown only to its owner) and `faceless.jpg`, with the head pixelated and blurred. The browser finds the head with MediaPipe Pose (`headBoxFromLandmarks` in `packages/shared/src/photo.ts`); without a pose the top 22% of the photo is blurred instead. Providers only ever get `faceless.jpg` (unless `face_opt_in`), as a 10-minute signed URL.
- **Cost guard:** before queueing, `checkRenderBudget` counts the layers that aren't cached and the profile's real-provider renders in the last 24 h; over `TRYON_DAILY_LIMIT` (default 20) → 429. Cache hits and the mock never count.
- **Smoke test:** `pnpm --filter @fitmirror/web tryon:smoke -- --photo <path> --garment-image <path|url>` makes one real fal render with the production code path (`--dry-run` does everything but the call).

## Extension prototype route (2026-10-17)

- `POST /api/tryon/direct` keeps the extension prototype's flow working: no session, `{ modelImage, garmentImage, productUrl, name, retailer?, category? }` with images inline (data URL or http URL), waits for fal and returns `{ imageUrl, cart }`. The extension chains by sending the previous render as `modelImage`.
- It uses the same `FalTryOn` as the pipeline (`renderImages`); free-text categories map through `falCategoryFromText` (`footwear`, `accessory` → `auto`).
- Guards, since there is no profile: an in-memory result cache keyed on both images and the category, and a per-IP limit of `TRYON_DAILY_LIMIT` per 24 h (per server instance). Demo mode returns the mock placeholder; no `FAL_KEY` → 503.
- Off in production (404) unless `TRYON_DIRECT_ENABLED=true`, because the guards are best effort and the route can spend fal credit for anyone who can reach it.
- **Head blur:** the extension sends its original photo with `blurHead: true` and the head box MediaPipe found when the photo was saved (`headBox`, or null → top band). The route blurs it with `facelessDataUrl` (the same `processModelPhoto` + `blurRegion` as `/onboarding`) before fal. Chained renders (http URLs) come from a blurred photo and are sent as they are. The extension skips the blur only when `faceOptIn` is set in `chrome.storage` (`fitmirror-settings`); changing it restarts the look from the original photo.
- The liked-links file (`apps/web/.data/`) is a local-dev convenience; a write failure (read-only filesystem on Vercel) no longer fails a render.

