# Core flows and outfit editing

Spec section 4.

## A. Onboarding

User enters height and units, then either (a) opens the QR on the phone to capture, or (b) types measurements. A review screen shows editable values with a confidence badge per value. Saving creates a profile.

## B. Add to figure (the hero flow)

User browses a retailer. The extension detects a product page and shows a floating button. Click: the content script extracts data from the live DOM, POSTs to ingest, and the side panel opens with the fit verdict within seconds and queues a try-on render.

## C. Compare and decide

In the studio, items go to the outfit tray. Outfits can be saved and shown side by side with fit verdicts and prices.

## D. Checkout

Cart grouped by retailer. Each line shows the chosen size and a deep link. The payment step goes through `PaymentProvider`.

## E. Edit the outfit: add, remove, swap

One outfit state serves the studio, the side panel, and product pages. Every edit is one of four operations: **add, remove, swap, change size**. No edit resets the rest of the outfit.

### Slot rules

- Slots are `top`, `bottom`, `outerwear`, `dress`. A dress fills both top and bottom.
- Try-on layer order: dress or top, then bottom, then outerwear.
- Add into an empty slot places the item. Add into an occupied slot is a swap: a toast names the replaced item and offers Undo.
- Adding a dress while a top or bottom is worn replaces both; adding a top or bottom while a dress is worn replaces the dress. Both show the same toast with Undo.
- Swap replaces the garment in a slot and keeps its layer position. The same garment in a different size is **Change size**.
- Remove empties the slot (a dress empties both). An empty outfit shows the bare model photo and mannequin.
- Undo/redo: client-side history of the last 20 operations in the store, reachable from the toast, Ctrl/Cmd+Z, and tray buttons. Server writes follow optimistically; on failure, revert and show an error toast.

### Click to edit

Clicking a worn item anywhere (try-on photo, 3D figure, outfit tray chip, a saved outfit in compare) opens one popover: **Swap, Change size, Remove, Open on retailer site**.

- **Try-on photo hit zones** come from the model photo's pose landmarks, computed once at capture: top is shoulders to hips, widened by shoulder width; bottom is hips to ankles; outerwear is the top zone plus the arms. Overlaps resolve by layer order (outerwear first). Hovering outlines the zone so people see it's clickable. Per-layer masks from a human-parsing model are the later upgrade.
- **3D figure:** raycast against the mannequin's named segments; torso and arms map to top or outerwear, hips and legs to bottom.
- **Outfit tray chips always work**, so editing never depends on the hit zones.

### Swap picker

- Opens the closet filtered to the clicked slot's category, searchable by brand, including extension imports and fixtures.
- Every candidate card shows its fit verdict for this user (best size and tight/good/loose), computed instantly by the fit engine, so people compare before they swap.
- Default sort is fit score; price is the alternative.
- Hover or focus previews the candidate in the tray with no render yet; choosing it commits the swap. If the resulting outfit is already cached, its render appears immediately.
- Fits-you-better alternatives (tier 2) sit at the top of the picker.

### Updating the image and fit panel

- Each layer's cache key chains from the previous layer's key (see `tryon.md`), so an edit re-renders only that layer and everything above it. Removing the top-most layer is always a cache hit.
- After any edit, show the nearest cached render at once (e.g. top plus bottom after the outerwear is removed) with a skeleton over the changed zone while the new render runs. **Never blank the figure.**
- The fit panel updates synchronously because the fit engine is pure. It lists each worn item with its size and verdict, plus one outfit-level line such as: "Top fits, bottom is tight at the waist."
- Discard stale render results by comparing each result's chain key with the current outfit's key.

### Data and API

`outfit_items` has a `slot` column and is unique per slot (see `architecture.md`). The operations map to the outfit item routes; a swap is one PATCH that replaces garment and size in place, so layer position is kept.
