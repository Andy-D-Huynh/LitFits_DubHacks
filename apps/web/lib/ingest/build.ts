import { createHash } from 'node:crypto';
import { normalizeSizeChart, type Category, type Garment } from '@fitmirror/shared';
import type { NormalizedGarment } from '../providers/llm/types';

// Turns normalizer output into a Garment (minus id/createdAt). Inches become cm
// here, in code, never in the LLM.
export function normalizedToGarment(
  n: NormalizedGarment & { category: Category },
  sourceUrl: string,
): Omit<Garment, 'id' | 'createdAt'> {
  return {
    sourceUrl,
    retailer: new URL(sourceUrl).hostname.replace(/^www\./, ''),
    brand: n.brand,
    name: n.name,
    category: n.category,
    imageUrls: n.imageUrls,
    primaryImageUrl: n.primaryImageUrl,
    primaryColor: n.primaryColor,
    priceCents: n.priceCents,
    currency: n.currency,
    fitType: n.fitType,
    stretch: n.stretch,
    chartType: n.sizeChart ? n.chartType : null,
    measurementBasis: n.sizeChart ? n.measurementBasis : null,
    sizeChart: n.sizeChart ? normalizeSizeChart(n.sizeChart) : null,
    extractionMethod: n.extractionMethod,
    extractionConfidence: n.extractionConfidence,
    isPlaceholder: false,
  };
}

// Stable id for demo-mode ingests (nothing is stored), shaped as a v4 UUID.
export function demoGarmentId(sourceUrl: string): string {
  const h = createHash('sha256').update(sourceUrl).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
