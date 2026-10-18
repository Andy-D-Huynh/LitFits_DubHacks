import { describe, expect, it } from 'vitest';
import {
  cleanSizeLabel,
  garmentSizeDirective,
  orderSizeLabels,
  resolveSizeList,
  sizesFromJsonLd,
} from './garment-size';

describe('cleanSizeLabel', () => {
  it('keeps letter, word, and numeric sizes', () => {
    expect(cleanSizeLabel('M', true)).toBe('M');
    expect(cleanSizeLabel('Size: XL', true)).toBe('XL');
    expect(cleanSizeLabel('Medium (M)', true)).toBe('Medium');
    expect(cleanSizeLabel('32', true)).toBe('32');
    expect(cleanSizeLabel('M - In stock', true)).toBe('M');
    expect(cleanSizeLabel('L (Out of stock)', true)).toBe('L');
  });

  it('rejects placeholders and size guides', () => {
    expect(cleanSizeLabel('Select a size', true)).toBeNull();
    expect(cleanSizeLabel('Size guide', true)).toBeNull();
    expect(cleanSizeLabel('Choose your size', true)).toBeNull();
  });
});

describe('orderSizeLabels', () => {
  it('sorts letter sizes from smallest to largest', () => {
    expect(orderSizeLabels(['L', 'XS', 'M', 'S', 'XL'])).toEqual(['XS', 'S', 'M', 'L', 'XL']);
  });

  it('sorts numeric sizes numerically', () => {
    expect(orderSizeLabels(['32', '28', '30', '34'])).toEqual(['28', '30', '32', '34']);
  });

  it('keeps page order when labels cannot be ranked together', () => {
    expect(orderSizeLabels(['One size', 'S'])).toEqual(['One size', 'S']);
  });
});

describe('resolveSizeList', () => {
  it('dedupes labels and remembers which size is selected', () => {
    const list = resolveSizeList([
      { label: 'Select size' },
      { label: 'L' },
      { label: 'S', selected: false },
      { label: 'M', selected: true },
      { label: 'Size M', selected: true },
      { label: 'XL' },
    ]);
    expect(list.sizes).toEqual(['S', 'M', 'L', 'XL']);
    expect(list.selected).toBe('M');
  });
});

describe('sizesFromJsonLd', () => {
  it('reads sizes from product offers', () => {
    const sizes = sizesFromJsonLd([
      JSON.stringify({
        '@type': 'Product',
        name: 'Tee',
        offers: [
          { '@type': 'Offer', size: 'L', price: '40' },
          { '@type': 'Offer', size: 'S', price: '40' },
          { '@type': 'Offer', size: { name: 'M' }, price: '40' },
        ],
      }),
    ]);
    expect(sizes).toEqual(['S', 'M', 'L']);
  });
});

describe('garmentSizeDirective', () => {
  const garment = 'the top/jacket (Oxford shirt)';

  it('locks body proportions for every size', () => {
    const prompt = garmentSizeDirective(garment, { size: 'L', offered: ['S', 'M', 'L'] });
    expect(prompt).toContain('BODY PROPORTION REQUIREMENT');
    expect(prompt).toContain('Do not make the person larger, smaller, taller, or shorter');
    expect(prompt).toContain('Only the newly added garment may change');
  });

  it('describes the smallest size without shrinking the person', () => {
    const prompt = garmentSizeDirective(garment, { size: 'XS', offered: ['XS', 'S', 'M', 'L', 'XL'] });
    expect(prompt).toContain('size "XS"');
    expect(prompt).toContain('the smallest size in this run');
    expect(prompt).toContain('Do not shrink the person');
  });

  it('describes a middle size as the garment\'s intended ease', () => {
    const prompt = garmentSizeDirective(garment, { size: 'M', offered: ['XS', 'S', 'M', 'L', 'XL'] });
    expect(prompt).toContain('a middle size in this run');
    expect(prompt).toContain('neither pulled tight nor hanging with extra volume');
  });

  it('describes the largest size without enlarging the person', () => {
    const prompt = garmentSizeDirective(garment, { size: '34', offered: ['28', '30', '32', '34'] });
    expect(prompt).toContain('the largest size in this run');
    expect(prompt).toContain('Do not enlarge the person');
    expect(prompt).toContain('28, 30, 32, 34');
  });

  it('wears a single size as photographed', () => {
    const prompt = garmentSizeDirective(garment, { size: 'One size', offered: ['One size'] });
    expect(prompt).toContain('the only size offered');
    expect(prompt).not.toContain('smallest size');
  });
});
