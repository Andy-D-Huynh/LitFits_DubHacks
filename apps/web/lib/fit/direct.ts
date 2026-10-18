import {
  computeFit,
  normalizeSizeChart,
  type FitDirectRequestSchema,
  type FitResult,
} from '@fitmirror/shared';
import type { z } from 'zod';
import { demoGarmentId } from '../ingest/build';
import { canonicalProductUrl } from '../ingest/url';

type FitDirectInput = z.output<typeof FitDirectRequestSchema>;

// The fit engine over a request-supplied body and chart (POST /api/fit/direct).
// garmentId is stable per product page (same id demo-mode ingest gives it), or
// per chart when there is no URL, so clients can key results on it.
export function fitDirect({
  measurements,
  fitPreference,
  measurementSource,
  garment,
}: FitDirectInput): FitResult {
  const id = demoGarmentId(
    garment.sourceUrl
      ? canonicalProductUrl(garment.sourceUrl)
      : `chart:${JSON.stringify(garment.sizeChart)}`,
  );
  return computeFit(
    {
      id,
      category: garment.category,
      fitType: garment.fitType,
      stretch: garment.stretch,
      chartType: garment.chartType,
      measurementBasis: garment.measurementBasis,
      sizeChart: normalizeSizeChart(garment.sizeChart),
      extractionMethod: garment.extractionMethod,
    },
    { measurements, fitPreference, measurementSource: measurementSource ?? null },
  );
}
