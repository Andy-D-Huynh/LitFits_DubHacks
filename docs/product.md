# Product

Spec sections 1, 2, 16.

## What it is

A personal fit-and-look layer for online clothes shopping. The user enters or scans their body once. Then, on any store's product page, they click **Add to figure** and instantly see (a) which size fits them and why, and (b) what the piece looks like on them.

**How it differs from Doppl-style try-on:** try-on apps answer only how it looks. FitMirror answers whether it fits first, using the retailer's real size chart against the user's measurements, then shows how it looks. The any-store claim comes from a browser extension that reads the product page the user is already viewing, which avoids scraping and bot blocking.

## Honest limits (design around these, and say them in the pitch)

- Photo-based measurements are roughly ±3 cm. Manual entry always overrides.
- The try-on image shows design and color, not size. The size verdict comes from the fit engine, not from the picture.
- The 3D figure is a parametric mannequin scaled to the user's measurements with a fit heatmap, not a photoreal scan.
- Fitting does not equal flattering. The fit verdict means "wearable in this size"; the try-on image is the style signal. Do not claim one implies the other.

## Scope tiers

### Tier 1 (must work, demo-critical)

1. Body profile: height plus measurements by manual entry, editable.
2. Chrome extension: Add to figure button on product pages that extracts product data and size chart.
3. Ingestion API with LLM normalization and fixtures fallback.
4. Deterministic fit engine with per-size verdict and explanations.
5. Studio web app: figure viewport, fit panel, outfit tray.
6. Outfit editing: add, remove, and swap garments in the same session by clicking a worn item on the figure or in the tray, with undo (see `outfit-editing.md`, flow E).
7. 2D try-on render from the user's model photo, cached.

### Tier 2 (should work)

8. Phone capture via QR handoff with in-browser pose estimation.
9. 3D rotatable mannequin with fit heatmap.
10. Saved outfits and side-by-side compare.
11. Cart grouped by retailer with deep links; checkout via VISA sandbox (see `checkout-privacy.md`).
12. Fits-you-better alternatives drawn from already ingested items.

### Tier 3 (stretch; only after tier 1 and 2 checkpoints pass)

13. Messaging agent (Photon) sending outfit suggestions and restock alerts.
14. Extension auto add-to-cart adapters for two allowlisted retailers.
15. Face-in-figure option, animation polish, rewards, upload-an-outfit vibe matching.

### Explicitly out of scope

Arbitrary-store cheaper-alternative search, loyalty rewards, true 3D cloth simulation.

## Demo plan (3 minutes)

1. Scan on phone via QR (precaptured fallback ready); edit one value to show manual override.
2. On a real retailer page, click Add to figure. The side panel says size M fits and L is 6 cm too loose at the chest, with the explanation; the try-on render lands.
3. Add a bottom from a second retailer, click the top on the figure to swap it, remove an item and undo; save the outfit; compare it with a saved one.
4. Check out with the VISA sandbox in one confirmation.
5. If built, a Photon message arrives suggesting a similar piece that fits better.

**Fallbacks:** fixtures for any extraction failure; precomputed renders for any provider failure; recorded video as a last resort. Rehearse the failure path once.
