import type { ClothingProduct, RetailerAdapter } from '../figure/contracts';
import { filterProducts } from './search';
import { silhouetteUrls } from './silhouettes';

const SOURCE_ID = 'demo-outlet';

function outletProduct(
  input: Omit<ClothingProduct, 'source' | 'sample' | 'productUrl' | 'imageUrl' | 'transparentImageUrl'> & {
    fill: string;
    shape: 'fleece' | 'jacket';
  },
): ClothingProduct {
  const images = silhouetteUrls(input.shape, input.fill);
  return {
    id: input.id,
    source: SOURCE_ID,
    title: input.title,
    brand: input.brand,
    category: input.category,
    color: input.color,
    price: input.price,
    availableSizes: input.availableSizes,
    imageUrl: images.imageUrl,
    transparentImageUrl: images.transparentImageUrl,
    productUrl: `/shop#${input.id}`,
    sample: true,
  };
}

/** Second demo source so the shop merges adapters instead of hard-coding one retailer. */
export const DEMO_OUTLET_PRODUCTS: ClothingProduct[] = [
  outletProduct({
    id: 'out-fleece',
    title: 'Fleece Pullover',
    brand: 'Northline',
    category: 'top',
    color: 'Heather',
    fill: '#8d97a1',
    shape: 'fleece',
    availableSizes: ['S', 'M', 'L'],
    price: { amount: 29, currency: 'USD' },
  }),
  outletProduct({
    id: 'out-chore',
    title: 'Chore Jacket',
    brand: 'Harbor Knit',
    category: 'outerwear',
    color: 'Indigo',
    fill: '#2f3d66',
    shape: 'jacket',
    availableSizes: ['S', 'M', 'L', 'XL'],
    price: { amount: 64, currency: 'USD' },
  }),
];

export const demoOutletAdapter: RetailerAdapter = {
  sourceId: SOURCE_ID,
  label: 'Demo outlet',
  kind: 'demo',
  search(query) {
    return Promise.resolve(filterProducts(DEMO_OUTLET_PRODUCTS, query));
  },
};
