/**
 * Flat garment silhouettes for the sample catalog.
 * Transparent SVG only — these are not retailer photos and not fit measurements.
 */

export type SilhouetteKind = 'tee' | 'tank' | 'trousers' | 'skirt' | 'jacket' | 'coat' | 'dress' | 'fleece';

const PATHS: Record<SilhouetteKind, string> = {
  tee: 'M46 28 L60 36 L74 28 L92 46 L78 54 L74 48 V96 H46 V48 L42 54 L28 46 Z',
  tank: 'M48 26 H72 L76 42 V100 H44 V42 Z',
  trousers: 'M46 24 H74 V48 L86 142 H70 L60 74 L50 142 H34 L46 48 Z',
  skirt: 'M50 30 H70 L94 124 H26 Z',
  jacket: 'M40 22 L60 32 L80 22 L100 48 L84 58 L78 50 V108 H42 V50 L36 58 L20 48 Z',
  coat: 'M38 16 L60 28 L82 16 L104 44 L86 56 L80 46 V132 H40 V46 L34 56 L16 44 Z',
  dress: 'M52 18 H68 L76 42 L92 144 H28 L44 42 Z',
  fleece: 'M42 26 L60 36 L78 26 L94 44 L80 54 V102 H40 V54 L26 44 Z',
};

function svgDataUrl(kind: SilhouetteKind, fill: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160" fill="none">` +
    `<path d="${PATHS[kind]}" fill="${fill}" stroke="#142028" stroke-width="2" stroke-linejoin="round"/>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Catalog image and try-on asset are the same flat silhouette on a transparent field. */
export function silhouetteUrls(
  kind: SilhouetteKind,
  fill: string,
): { imageUrl: string; transparentImageUrl: string } {
  const url = svgDataUrl(kind, fill);
  return { imageUrl: url, transparentImageUrl: url };
}
