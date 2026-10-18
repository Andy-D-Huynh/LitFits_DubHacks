import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type LikedLink = {
  id: string;
  productUrl: string;
  name: string;
  garmentImageUrl: string;
  retailer: string | null;
  addedAt: string;
};

const FILE = path.join(process.cwd(), '.data', 'liked-garments.json');

/** Same product URL replaces the previous row so the cart has one link per piece. */
export function addLikedLink(items: LikedLink[], next: LikedLink): LikedLink[] {
  return [next, ...items.filter((item) => item.productUrl !== next.productUrl)].slice(0, 100);
}

export async function readLikedLinks(): Promise<LikedLink[]> {
  try {
    const raw = await readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Partial<LikedLink>;
      if (typeof row.productUrl !== 'string' || typeof row.name !== 'string') return [];
      return [
        {
          id: typeof row.id === 'string' ? row.id : crypto.randomUUID(),
          productUrl: row.productUrl,
          name: row.name,
          garmentImageUrl: typeof row.garmentImageUrl === 'string' ? row.garmentImageUrl : '',
          retailer: row.retailer ?? null,
          addedAt: typeof row.addedAt === 'string' ? row.addedAt : new Date().toISOString(),
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function rememberLikedLink(next: LikedLink): Promise<LikedLink[]> {
  const items = addLikedLink(await readLikedLinks(), next);
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(items, null, 2));
  return items;
}
