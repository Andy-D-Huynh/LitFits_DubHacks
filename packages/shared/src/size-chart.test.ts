import { describe, expect, it } from 'vitest';
import { computeFit } from './fit-engine';
import { FitDirectRequestSchema } from './schemas';
import { findSizeChart, fitGarmentFromPage } from './size-chart';
import { normalizeSizeChart } from './units';

const SHIPPING =
  '<table><tr><th>Region</th><th>Days</th></tr><tr><td>US</td><td>3</td></tr></table>';
const CHART = `<table>
  <tr><th>Size</th><th>Chest (in)</th><th>Waist (in)</th></tr>
  <tr><td>S</td><td>34-36</td><td>28-30</td></tr>
  <tr><td>M</td><td>38-40</td><td>32-34</td></tr>
  <tr><td>L</td><td>42-44</td><td>36-38</td></tr>
</table>`;

describe('findSizeChart', () => {
  it('skips tables that are not size charts', () => {
    const parsed = findSizeChart(`<p>Shipping</p>${SHIPPING}<div>${CHART}</div>`);
    expect(parsed?.chart.unit).toBe('in');
    expect(parsed?.chart.rows.map((r) => r.label)).toEqual(['S', 'M', 'L']);
    expect(parsed?.chartType).toBe('body');
  });

  it('returns null when no table parses', () => {
    expect(findSizeChart(SHIPPING)).toBeNull();
    expect(findSizeChart('<p>no tables</p>')).toBeNull();
  });
});

describe('fitGarmentFromPage', () => {
  const page = {
    sourceUrl: 'https://shop.test/p/tee',
    category: 'top',
    tablesHtml: SHIPPING + CHART,
    text: 'Relaxed fit crew tee, 95% cotton 5% elastane',
  };

  it('builds a /api/fit/direct garment with fit type and stretch from the text', () => {
    const garment = fitGarmentFromPage(page);
    expect(garment).toMatchObject({
      sourceUrl: 'https://shop.test/p/tee',
      category: 'top',
      fitType: 'relaxed',
      stretch: 'high',
      chartType: 'body',
      measurementBasis: 'circumference',
      extractionMethod: 'dom',
    });
    const body = FitDirectRequestSchema.parse({ measurements: { chest: 99 }, garment });
    expect(body.garment.sizeChart.unit).toBe('in');
  });

  it('is null for categories without fit rules or pages without a chart', () => {
    expect(fitGarmentFromPage({ ...page, category: 'footwear' })).toBeNull();
    expect(fitGarmentFromPage({ ...page, tablesHtml: SHIPPING })).toBeNull();
  });

  it('feeds the fit engine end to end', () => {
    const garment = fitGarmentFromPage({ ...page, text: 'Regular fit tee, 100% cotton' })!;
    const result = computeFit(
      {
        ...garment,
        id: '00000000-0000-4000-8000-000000000000',
        sizeChart: normalizeSizeChart(garment.sizeChart),
      },
      { measurements: { chest: 99 }, measurementSource: null, fitPreference: 'regular' },
    );
    expect(result.recommendedSize).toBe('M');
  });
});

describe('findSizeChart context', () => {
  it('reads the unit from the heading just before the table', () => {
    const table = CHART.replace(/ \(in\)/g, '');
    expect(findSizeChart(table)).toBeNull();
    expect(findSizeChart(`<h3>Size guide (inches)</h3>${table}`)?.chart.unit).toBe('in');
  });
});
