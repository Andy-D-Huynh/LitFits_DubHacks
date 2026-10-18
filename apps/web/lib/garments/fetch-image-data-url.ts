/** Server-side: download a product image and return a data URL for exact try-on. */
export async function fetchImageDataUrl(imageUrl: string): Promise<string | null> {
  try {
    const url = new URL(imageUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const res = await fetch(url.toString(), {
      headers: { Accept: 'image/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Cap ~2.5MB data URLs for localStorage
    if (buf.byteLength > 2_500_000) return null;
    return `data:${contentType.split(';')[0]};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
