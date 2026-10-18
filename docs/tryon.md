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
