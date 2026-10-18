import { z } from 'zod';
import { HEIGHT_RANGE_CM, MEASUREMENT_RANGES_CM } from './fit-rules';

// Canonical schemas. Types in types.ts are inferred from these; the SQL
// migrations mirror them. Internal units are always cm.

// ---- Enums ----

export const DimSchema = z.enum([
  'shoulder',
  'chest',
  'waist',
  'hip',
  'inseam',
  'length',
  'sleeve',
]);
export const CategorySchema = z.enum(['top', 'bottom', 'outerwear', 'dress']);
// A dress fills both top and bottom (see docs/outfit-editing.md).
export const SlotSchema = CategorySchema;
export const FitTypeSchema = z.enum(['slim', 'regular', 'relaxed']);
export const StretchSchema = z.enum(['none', 'low', 'high']);
export const ChartTypeSchema = z.enum(['body', 'garment']);
export const MeasurementBasisSchema = z.enum(['circumference', 'flat']);
export const ExtractionMethodSchema = z.enum([
  'dom',
  'llm_html',
  'llm_vision',
  'manual',
  'fixture',
]);
export const FitPreferenceSchema = z.enum(['snug', 'regular', 'loose']);
export const FitVerdictSchema = z.enum(['tight', 'good', 'loose', 'unknown']);
export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low']);
export const MeasurementKeySchema = z.enum([
  'shoulder_width',
  'chest',
  'waist',
  'hip',
  'inseam',
  'arm_length',
]);
export const MeasurementSourceSchema = z.enum(['manual', 'photo']);
export const LengthUnitSchema = z.enum(['cm', 'in']);

// ---- Size charts ----

const positive = z.number().positive();

// number = garment measure, [min, max] = body range
export const DimValueSchema = z.union([
  positive,
  z
    .tuple([positive, positive])
    .refine(([min, max]) => min <= max, { message: 'range min must be <= max' }),
]);

export const SizeRowSchema = z.object({
  label: z.string().min(1),
  shoulder: DimValueSchema.optional(),
  chest: DimValueSchema.optional(),
  waist: DimValueSchema.optional(),
  hip: DimValueSchema.optional(),
  inseam: DimValueSchema.optional(),
  length: DimValueSchema.optional(),
  sleeve: DimValueSchema.optional(),
});

// As extracted, before unit conversion (inches convert in code, never in the LLM).
export const RawSizeChartSchema = z.object({
  unit: LengthUnitSchema,
  rows: z.array(SizeRowSchema).min(1),
});

export const SizeChartSchema = z.object({
  unit: z.literal('cm'),
  rows: z.array(SizeRowSchema).min(1),
});

// ---- Garments ----

export const GarmentSchema = z.object({
  id: z.uuid(),
  sourceUrl: z.url().nullable(),
  retailer: z.string().nullable(),
  brand: z.string().nullable(),
  name: z.string().nullable(),
  category: CategorySchema,
  imageUrls: z.array(z.url()),
  primaryImageUrl: z.url().nullable(),
  primaryColor: z.string().nullable(),
  priceCents: z.number().int().nonnegative().nullable(),
  currency: z.string().length(3).nullable(),
  fitType: FitTypeSchema.nullable(),
  stretch: StretchSchema,
  chartType: ChartTypeSchema.nullable(),
  measurementBasis: MeasurementBasisSchema.nullable(),
  sizeChart: SizeChartSchema.nullable(),
  extractionMethod: ExtractionMethodSchema,
  extractionConfidence: z.number().min(0).max(1).nullable(),
  // True only for seeded fixtures whose charts are not verified retailer data.
  isPlaceholder: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
});

// fixtures/garments/*.json. Ids are fixed so demo mode and the seeded DB agree.
// The file's `placeholder` key maps to Garment.isPlaceholder.
export const GarmentFixtureSchema = GarmentSchema.omit({
  createdAt: true,
  isPlaceholder: true,
}).extend({
  extractionMethod: z.literal('fixture'),
  placeholder: z.boolean(),
});

// ---- Profiles ----

export const MeasurementsSchema = z.partialRecord(MeasurementKeySchema, positive);

export const ProfileSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  heightCm: positive,
  fitPreference: FitPreferenceSchema,
  measurements: MeasurementsSchema,
  measurementSource: z.partialRecord(MeasurementKeySchema, MeasurementSourceSchema).nullable(),
  confidence: z.partialRecord(MeasurementKeySchema, z.number().min(0).max(1)).nullable(),
  modelPhotoPath: z.string().nullable(),
  faceOptIn: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
});

// ---- Outfits ----

export const OutfitSchema = z.object({
  id: z.uuid(),
  profileId: z.uuid(),
  name: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const OutfitItemSchema = z.object({
  outfitId: z.uuid(),
  garmentId: z.uuid(),
  selectedSize: z.string().nullable(),
  slot: SlotSchema,
  position: z.number().int().nullable(),
});

// ---- Orders ----
// Status values are not specified yet (docs/checkout-privacy.md), so they stay free text like the SQL.

export const OrderLineSchema = z.object({
  orderId: z.uuid(),
  garmentId: z.uuid(),
  size: z.string().nullable(),
  retailer: z.string().nullable(),
  priceCents: z.number().int().nonnegative().nullable(),
  status: z.string().nullable(),
});

export const OrderSchema = z.object({
  id: z.uuid(),
  profileId: z.uuid(),
  outfitId: z.uuid(),
  status: z.string().nullable(),
  totalCents: z.number().int().nonnegative().nullable(),
  paymentProvider: z.string().nullable(),
  paymentRef: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  lines: z.array(OrderLineSchema),
});

// ---- Fit results ----

export const DimResultSchema = z.object({
  dim: DimSchema,
  bodyCm: z.number(),
  garmentCm: z.number().optional(),
  rangeCm: z.tuple([z.number(), z.number()]).optional(),
  easeCm: z.number().optional(),
  verdict: FitVerdictSchema,
  note: z.string().min(1),
});

export const SizeResultSchema = z.object({
  size: z.string(),
  overall: FitVerdictSchema,
  score: z.number().min(0).max(1),
  dims: z.array(DimResultSchema),
});

export const FitResultSchema = z.object({
  garmentId: z.uuid(),
  recommendedSize: z.string().nullable(),
  confidence: ConfidenceLevelSchema,
  perSize: z.array(SizeResultSchema),
  warnings: z.array(z.string()),
});

// ---- API bodies ----

export const IngestSourceSchema = z.enum(['extension', 'url', 'screenshot']);

export const IngestRequestSchema = z.object({
  source: IngestSourceSchema,
  url: z.url(),
  title: z.string().optional(),
  jsonld: z.unknown().optional(),
  imageUrls: z.array(z.url()).max(8).default([]),
  // The extension strips style/class/script from the table before sending.
  chartHtml: z.string().max(20_000).optional(),
  pageText: z.string().max(8000).optional(),
  screenshotPath: z.string().optional(),
});

export const FitRequestSchema = z.object({
  garmentId: z.uuid(),
  profileId: z.uuid(),
});

// ---- Profile input (PUT /api/profile) ----

const inRange = ([min, max]: readonly [number, number]) => z.number().min(min).max(max);

export const ProfileInputSchema = z.object({
  heightCm: inRange(HEIGHT_RANGE_CM),
  fitPreference: FitPreferenceSchema.default('regular'),
  measurements: z
    .object({
      shoulder_width: inRange(MEASUREMENT_RANGES_CM.shoulder_width).optional(),
      chest: inRange(MEASUREMENT_RANGES_CM.chest).optional(),
      waist: inRange(MEASUREMENT_RANGES_CM.waist).optional(),
      hip: inRange(MEASUREMENT_RANGES_CM.hip).optional(),
      inseam: inRange(MEASUREMENT_RANGES_CM.inseam).optional(),
      arm_length: inRange(MEASUREMENT_RANGES_CM.arm_length).optional(),
    })
    .strict(),
});

// ---- Direct fit (POST /api/fit/direct) ----

// Session-less fit for the extension: the body measurements and the garment's
// chart travel in the request, nothing is stored. Measurements use the same
// cm ranges as PUT /api/profile; the chart may be in cm or inches and is
// converted in code.
export const FitDirectRequestSchema = z.object({
  measurements: ProfileInputSchema.shape.measurements,
  fitPreference: FitPreferenceSchema.default('regular'),
  measurementSource: z.partialRecord(MeasurementKeySchema, MeasurementSourceSchema).optional(),
  garment: z.object({
    // Only used to derive a stable garmentId for the result.
    sourceUrl: z.url().optional(),
    category: CategorySchema,
    fitType: FitTypeSchema.nullable().default(null),
    stretch: StretchSchema.default('none'),
    chartType: ChartTypeSchema.nullable().default(null),
    measurementBasis: MeasurementBasisSchema.nullable().default(null),
    sizeChart: RawSizeChartSchema.extend({ rows: z.array(SizeRowSchema).min(1).max(40) }),
    extractionMethod: z.enum(['dom', 'llm_html', 'manual']).default('dom'),
  }),
});

// ---- Outfits API ----

export const OutfitWithItemsSchema = OutfitSchema.extend({ items: z.array(OutfitItemSchema) });

export const CreateOutfitSchema = z.object({
  profileId: z.uuid(),
  name: z.string().trim().min(1).max(80).optional(),
});

// Omitted size → the fit engine's recommended size for the caller.
export const OutfitItemInputSchema = z.object({
  garmentId: z.uuid(),
  size: z.string().min(1).max(20).optional(),
});

// ---- Try-on API ----

// One garment per slot; up to dress/top + bottom + outerwear (or top + bottom + outerwear).
export const TryOnRequestSchema = z.object({
  garmentIds: z.array(z.uuid()).min(1).max(3),
  profileId: z.uuid(),
});
