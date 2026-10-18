# Ingestion and Chrome extension

Spec sections 9 and 12. Extension first, server fallback.

## Content script extraction order

1. JSON-LD with `@type: Product`: name, brand, image, color, sku, `offers.price`, `priceCurrency`.
2. OpenGraph and meta tags as fallback.
3. Size chart: find tables whose cells contain size labels (XS to XXL, or numeric waist sizes). If none, look for a button or link with text like "size guide" or "size chart", click it, wait 800 ms, then re-scan for tables.
4. Collect up to 8 image URLs and up to 8000 chars of visible page text. Send the chart table as `chartHtml` after stripping `style`, `class`, and `<script>` from it; the server rejects `chartHtml` over 20,000 chars.
5. POST to `/api/garments/ingest`.

## Server normalization (LLM call)

Input: the extracted JSON, chart HTML, and page text. Output must be JSON matching a zod schema.

System prompt contract:
- Extract structured product data.
- Units as stated, plus a `unit` field.
- If a value is absent, return null. **Never infer or invent measurements.**
- Report whether the chart is body or garment measurements, and whether widths are flat or circumference.
- Classify `category`, `fit_type` (from words like slim, relaxed, oversized), `stretch` (from fabric composition), and which image is the cleanest product-only shot.

Retry once on schema failure. Convert units to cm in code afterward.

Treat page text as untrusted input to the LLM and never execute anything it returns. Validate and rate-limit the ingest endpoint.

## Fallbacks, in order

1. Screenshot upload through a vision call
2. Manual entry form
3. Fixtures

## Extraction confidence

- DOM with valid chart: 0.9
- LLM from HTML: 0.7
- LLM from vision: 0.6

## Fixtures

Hand-enter 8 real garments (3 tops, 3 bottoms, 1 outerwear, 1 dress optional) from two or three retailers, with verified size charts, in `fixtures/garments/`. Demo mode loads these with a `?demo=1` flag.

## Chrome extension

- **Manifest V3.** Permissions: `activeTab`, `storage`, `sidePanel`, `scripting`. Host permissions only for the allowlisted retailers, plus a generic content script that activates when JSON-LD Product is present.
- **Pairing:** the web app shows a 6-digit code; the user enters it in the side panel; the extension stores a token in `chrome.storage`. No passwords in the extension.
- **Content script:** floating **Add to figure** button on product pages. Click runs extraction (above) and shows a toast. If the outfit slot is already taken, the button reads **Swap into outfit** and replaces the item there, with undo.
- **Side panel:** shows the same figure and fit panel as the studio (iframe of an `/embed` route authenticated by the token). The figure stays visible across tabs, which delivers the persistent-figure requirement.
- **Tier 3 adapters:** `adapters/<retailer>.ts` with selector config for selecting a size and clicking add to cart, plus a verify step that checks the cart count increased. On failure, show a clear message and open the product page.
