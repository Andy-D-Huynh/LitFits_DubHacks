import type {
  Category,
  ChartType,
  ExtractionMethod,
  FitType,
  IngestRequest,
  MeasurementBasis,
  RawSizeChart,
  Stretch,
} from '@fitmirror/shared';

// Product normalization (docs/ingestion-extension.md). Input is product-page
// data only: no user body data or photos ever reach a normalizer.

export type NormalizedGarment = {
  name: string | null;
  brand: string | null;
  category: Category | 'unsupported';
  fitType: FitType | null;
  stretch: Stretch;
  primaryColor: string | null;
  priceCents: number | null;
  currency: string | null;
  chartType: ChartType | null;
  measurementBasis: MeasurementBasis | null;
  sizeChart: RawSizeChart | null; // units as stated; converted to cm in code afterward
  primaryImageUrl: string | null;
  imageUrls: string[];
  extractionMethod: ExtractionMethod;
  extractionConfidence: number;
};

export interface GarmentNormalizer {
  readonly name: string;
  normalize(input: IngestRequest): Promise<NormalizedGarment>;
}
