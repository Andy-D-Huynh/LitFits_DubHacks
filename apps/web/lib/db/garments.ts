import { GarmentSchema, type Garment } from '@fitmirror/shared';

// Maps between the garments table (snake_case) and the shared Garment type.
// No 'server-only' import so scripts/seed.ts can use it from plain Node.

export type GarmentRow = {
  id: string;
  source_url: string | null;
  retailer: string | null;
  brand: string | null;
  name: string | null;
  category: Garment['category'];
  image_urls: string[];
  primary_image_url: string | null;
  primary_color: string | null;
  price_cents: number | null;
  currency: string | null;
  fit_type: Garment['fitType'];
  stretch: Garment['stretch'];
  chart_type: Garment['chartType'];
  measurement_basis: Garment['measurementBasis'];
  size_chart: Garment['sizeChart'];
  extraction_method: Garment['extractionMethod'];
  extraction_confidence: number | null;
  is_placeholder: boolean;
  created_at: string;
};

export function garmentToRow(g: Omit<Garment, 'createdAt'>): Omit<GarmentRow, 'created_at'> {
  return {
    id: g.id,
    source_url: g.sourceUrl,
    retailer: g.retailer,
    brand: g.brand,
    name: g.name,
    category: g.category,
    image_urls: g.imageUrls,
    primary_image_url: g.primaryImageUrl,
    primary_color: g.primaryColor,
    price_cents: g.priceCents,
    currency: g.currency,
    fit_type: g.fitType,
    stretch: g.stretch,
    chart_type: g.chartType,
    measurement_basis: g.measurementBasis,
    size_chart: g.sizeChart,
    extraction_method: g.extractionMethod,
    extraction_confidence: g.extractionConfidence,
    is_placeholder: g.isPlaceholder,
  };
}

// Validates on the way out: Postgres numeric comes back as a string, so coerce it.
export function rowToGarment(row: GarmentRow): Garment {
  return GarmentSchema.parse({
    id: row.id,
    sourceUrl: row.source_url,
    retailer: row.retailer,
    brand: row.brand,
    name: row.name,
    category: row.category,
    imageUrls: row.image_urls,
    primaryImageUrl: row.primary_image_url,
    primaryColor: row.primary_color,
    priceCents: row.price_cents,
    currency: row.currency,
    fitType: row.fit_type,
    stretch: row.stretch,
    chartType: row.chart_type,
    measurementBasis: row.measurement_basis,
    sizeChart: row.size_chart,
    extractionMethod: row.extraction_method,
    extractionConfidence:
      row.extraction_confidence === null ? null : Number(row.extraction_confidence),
    isPlaceholder: row.is_placeholder,
    createdAt: row.created_at,
  });
}
