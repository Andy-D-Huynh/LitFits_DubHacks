/**
 * Both sources registered here are demo fixtures. Prices, sizes, colors, and
 * links are sample data, not live retailer inventory. A live RetailerAdapter
 * can be added to listAdapters() later without changing the shop UI.
 */
import { clothingProductSchema, type CatalogQuery, type ClothingProduct, type RetailerAdapter } from '../figure/contracts';
import { demoCatalogAdapter } from './demo-catalog';
import { demoOutletAdapter } from './demo-outlet';

export function listAdapters(): RetailerAdapter[] {
  return [demoCatalogAdapter, demoOutletAdapter];
}

export function adapterLabel(sourceId: string): string {
  return listAdapters().find((adapter) => adapter.sourceId === sourceId)?.label ?? sourceId;
}

/** Run adapters independently. One failure or invalid row does not drop the rest. */
export async function searchAdapters(
  adapters: RetailerAdapter[],
  query: CatalogQuery,
): Promise<ClothingProduct[]> {
  const batches = await Promise.all(
    adapters.map(async (adapter) => {
      try {
        const rows = await adapter.search(query);
        const valid: ClothingProduct[] = [];
        for (const row of rows) {
          const parsed = clothingProductSchema.safeParse(row);
          if (parsed.success) valid.push(parsed.data);
        }
        return valid;
      } catch {
        return [];
      }
    }),
  );
  return batches.flat();
}

export async function searchCatalog(query: CatalogQuery): Promise<ClothingProduct[]> {
  return searchAdapters(listAdapters(), query);
}
