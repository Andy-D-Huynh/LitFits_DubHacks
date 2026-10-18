import type { ClothingProduct, RetailerAdapter } from '../figure/contracts';
import { filterProducts } from './search';
import { silhouetteUrls, type SilhouetteKind } from './silhouettes';

const SOURCE_ID = 'demo-catalog';

type DemoProductInput = {
  id: string;
  title: string;
  brand: string;
  category: ClothingProduct['category'];
  color: string;
  fill: string;
  shape: SilhouetteKind;
  sizes: string[];
  amount: number;
};

function demoProduct(input: DemoProductInput): ClothingProduct {
  const images = silhouetteUrls(input.shape, input.fill);
  return {
    id: input.id,
    source: SOURCE_ID,
    title: input.title,
    brand: input.brand,
    category: input.category,
    color: input.color,
    price: { amount: input.amount, currency: 'USD' },
    availableSizes: input.sizes,
    imageUrl: images.imageUrl,
    transparentImageUrl: images.transparentImageUrl,
    productUrl: `/shop#${input.id}`,
    sample: true,
  };
}

const LETTER = ['XS', 'S', 'M', 'L', 'XL'];
const WAIST = ['28', '30', '32', '34'];

/** Fictional sample closet. Prices and sizes are not live inventory. */
export const DEMO_CATALOG_PRODUCTS: ClothingProduct[] = [
  demoProduct({
    id: 'nl-rib-tank',
    title: 'Rib Tank',
    brand: 'Northline',
    category: 'top',
    color: 'Navy',
    fill: '#1b3a4b',
    shape: 'tank',
    sizes: LETTER,
    amount: 36,
  }),
  demoProduct({
    id: 'nl-field-overshirt',
    title: 'Field Overshirt',
    brand: 'Northline',
    category: 'outerwear',
    color: 'Olive',
    fill: '#4d5c3a',
    shape: 'jacket',
    sizes: ['S', 'M', 'L', 'XL'],
    amount: 118,
  }),
  demoProduct({
    id: 'nl-slip-dress',
    title: 'Slip Dress',
    brand: 'Northline',
    category: 'dress',
    color: 'Burgundy',
    fill: '#6e2e3c',
    shape: 'dress',
    sizes: ['XS', 'S', 'M', 'L'],
    amount: 128,
  }),
  demoProduct({
    id: 'hk-cable-crew',
    title: 'Cable Crew',
    brand: 'Harbor Knit',
    category: 'top',
    color: 'Cream',
    fill: '#e6dcc8',
    shape: 'tee',
    sizes: ['XS', 'S', 'M', 'L'],
    amount: 72,
  }),
  demoProduct({
    id: 'hk-wool-trouser',
    title: 'Wool Trouser',
    brand: 'Harbor Knit',
    category: 'bottom',
    color: 'Charcoal',
    fill: '#2c3338',
    shape: 'trousers',
    sizes: WAIST,
    amount: 98,
  }),
  demoProduct({
    id: 'hk-column-dress',
    title: 'Column Dress',
    brand: 'Harbor Knit',
    category: 'dress',
    color: 'Black',
    fill: '#1a1a1a',
    shape: 'dress',
    sizes: ['XS', 'S', 'M', 'L'],
    amount: 148,
  }),
  demoProduct({
    id: 'as-box-tee',
    title: 'Box Tee',
    brand: 'Atelier Sample',
    category: 'top',
    color: 'White',
    fill: '#f4f1ea',
    shape: 'tee',
    sizes: LETTER,
    amount: 44,
  }),
  demoProduct({
    id: 'as-pleat-skirt',
    title: 'Pleat Skirt',
    brand: 'Atelier Sample',
    category: 'bottom',
    color: 'Stone',
    fill: '#c4b8a5',
    shape: 'skirt',
    sizes: ['XS', 'S', 'M', 'L'],
    amount: 86,
  }),
  demoProduct({
    id: 'as-studio-coat',
    title: 'Studio Coat',
    brand: 'Atelier Sample',
    category: 'outerwear',
    color: 'Camel',
    fill: '#b8885a',
    shape: 'coat',
    sizes: ['XS', 'S', 'M', 'L'],
    amount: 210,
  }),
];

export const demoCatalogAdapter: RetailerAdapter = {
  sourceId: SOURCE_ID,
  label: 'Demo catalog',
  kind: 'demo',
  search(query) {
    return Promise.resolve(filterProducts(DEMO_CATALOG_PRODUCTS, query));
  },
};
