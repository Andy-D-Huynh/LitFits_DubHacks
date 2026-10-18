import { describe, expect, it } from 'vitest';
import { parsePageProduct, type PageSnapshot } from './parse-product';

function snapshot(partial: Partial<PageSnapshot>): PageSnapshot {
  return {
    url: 'https://shop.example/products/tee',
    title: 'Fallback title',
    jsonLdTexts: [],
    metas: [],
    images: [],
    ...partial,
  };
}

describe('parsePageProduct', () => {
  it('reads a Product JSON-LD block from whatever site served the page', () => {
    const product = parsePageProduct(
      snapshot({
        url: 'https://www.harbor-example.com/p/hoodie',
        jsonLdTexts: [
          JSON.stringify({
            '@graph': [
              {
                '@type': 'Product',
                name: 'Heavy hoodie',
                color: 'Navy',
                brand: { '@type': 'Brand', name: 'Harbor' },
                image: ['https://cdn.example/hoodie.jpg'],
                description: 'Fleece hoodie',
                offers: { price: '89.00', priceCurrency: 'USD' },
              },
            ],
          }),
        ],
      }),
    );

    expect(product.name).toBe('Heavy hoodie');
    expect(product.brand).toBe('Harbor');
    expect(product.imageUrl).toBe('https://cdn.example/hoodie.jpg');
    expect(product.category).toBe('outerwear');
    expect(product.retailer).toBe('harbor-example');
    expect(product.price).toEqual({ amount: 89, currency: 'USD' });
    expect(product.color).toBe('Navy');
    expect(product.sourceUrl).toBe('https://www.harbor-example.com/p/hoodie');
  });

  it('falls back to Open Graph when the page has no Product schema', () => {
    const product = parsePageProduct(
      snapshot({
        title: 'Ignored',
        metas: [
          { property: 'og:title', content: 'Wide pant' },
          { property: 'og:image', content: 'https://cdn.example/pant.jpg' },
          { property: 'og:description', content: 'Cotton trouser' },
        ],
      }),
    );
    expect(product.name).toBe('Wide pant');
    expect(product.imageUrl).toBe('https://cdn.example/pant.jpg');
    expect(product.category).toBe('bottom');
    expect(product.price).toBeNull();
  });

  it('does not invent a price when currency is missing', () => {
    const product = parsePageProduct(
      snapshot({
        jsonLdTexts: [
          JSON.stringify({
            '@type': 'Product',
            name: 'Sneaker',
            offers: { price: 120 },
          }),
        ],
      }),
    );
    expect(product.category).toBe('footwear');
    expect(product.price).toBeNull();
  });

  it('skips logos and uses the largest real image', () => {
    const product = parsePageProduct(
      snapshot({
        title: 'Lookbook',
        images: [
          { src: 'https://cdn.example/logo.png', alt: 'logo', width: 400, height: 200 },
          { src: 'https://cdn.example/shirt.jpg', alt: 'shirt', width: 800, height: 1000 },
        ],
      }),
    );
    expect(product.imageUrl).toBe('https://cdn.example/shirt.jpg');
  });
});
