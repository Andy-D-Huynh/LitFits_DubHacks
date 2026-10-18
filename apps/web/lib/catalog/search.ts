import type { CatalogQuery, ClothingProduct } from '../figure/contracts';

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function matchesText(product: ClothingProduct, text: string | undefined): boolean {
  const needle = normalized(text);
  if (!needle) return true;
  const fields = [product.title, product.brand, product.color ?? '', product.category];
  return fields.some((field) => field.toLowerCase().includes(needle));
}

/**
 * Pure catalog filter. Adapters call this so every source shares the same rules.
 * Text is a case-insensitive substring of title, brand, color, or category.
 * Brand, color, and size compare the whole value. Price bounds are inclusive
 * and drop products that have no price.
 */
export function filterProducts(products: ClothingProduct[], query: CatalogQuery): ClothingProduct[] {
  const category = query.category;
  const brand = normalized(query.brand);
  const size = query.size?.trim() ?? '';
  const color = normalized(query.color);
  const minPrice = query.minPrice;
  const maxPrice = query.maxPrice;
  const priceBounded = minPrice !== undefined || maxPrice !== undefined;

  return products.filter((product) => {
    if (!matchesText(product, query.text)) return false;

    if (category && category !== 'all' && product.category !== category) return false;

    if (brand && normalized(product.brand) !== brand) return false;

    if (size) {
      const sizes = product.availableSizes;
      if (!sizes?.includes(size)) return false;
    }

    if (color && normalized(product.color) !== color) return false;

    if (priceBounded) {
      if (!product.price) return false;
      if (minPrice !== undefined && product.price.amount < minPrice) return false;
      if (maxPrice !== undefined && product.price.amount > maxPrice) return false;
    }

    return true;
  });
}
