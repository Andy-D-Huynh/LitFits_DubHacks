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

The extension try-on depicts the size the shopper picked from the sizes listed on the product page. The person's body proportions stay the same; only that garment's ease and length change. The fit verdict still comes from the fit engine, not from this image. Place the render next to the fit panel.
