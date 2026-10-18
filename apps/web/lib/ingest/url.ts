// Canonical product URL, used as garments.source_url so re-ingesting the same
// page (with a different hash or tracking params) is idempotent.
const TRACKING = /^(utm_|fbclid$|gclid$|msclkid$|mc_|_ga$|ref$|ref_src$)/i;

export function canonicalProductUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  return url.toString();
}
