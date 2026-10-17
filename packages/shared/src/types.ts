import type { z } from 'zod';
import type * as S from './schemas';

// Inferred from schemas.ts so types and runtime validation cannot drift.

export type Dim = z.infer<typeof S.DimSchema>;
export type Category = z.infer<typeof S.CategorySchema>;
export type Slot = z.infer<typeof S.SlotSchema>;
export type FitType = z.infer<typeof S.FitTypeSchema>;
export type Stretch = z.infer<typeof S.StretchSchema>;
export type ChartType = z.infer<typeof S.ChartTypeSchema>;
export type MeasurementBasis = z.infer<typeof S.MeasurementBasisSchema>;
export type ExtractionMethod = z.infer<typeof S.ExtractionMethodSchema>;
export type FitPreference = z.infer<typeof S.FitPreferenceSchema>;
export type FitVerdict = z.infer<typeof S.FitVerdictSchema>;
export type ConfidenceLevel = z.infer<typeof S.ConfidenceLevelSchema>;
export type MeasurementKey = z.infer<typeof S.MeasurementKeySchema>;
export type MeasurementSource = z.infer<typeof S.MeasurementSourceSchema>;
export type LengthUnit = z.infer<typeof S.LengthUnitSchema>;

export type DimValue = z.infer<typeof S.DimValueSchema>;
export type SizeRow = z.infer<typeof S.SizeRowSchema>;
export type RawSizeChart = z.infer<typeof S.RawSizeChartSchema>;
export type SizeChart = z.infer<typeof S.SizeChartSchema>;

export type Garment = z.infer<typeof S.GarmentSchema>;
export type GarmentFixture = z.infer<typeof S.GarmentFixtureSchema>;
export type Measurements = z.infer<typeof S.MeasurementsSchema>;
export type Profile = z.infer<typeof S.ProfileSchema>;
export type Outfit = z.infer<typeof S.OutfitSchema>;
export type OutfitItem = z.infer<typeof S.OutfitItemSchema>;

export type DimResult = z.infer<typeof S.DimResultSchema>;
export type SizeResult = z.infer<typeof S.SizeResultSchema>;
export type FitResult = z.infer<typeof S.FitResultSchema>;

export type IngestSource = z.infer<typeof S.IngestSourceSchema>;
export type IngestRequest = z.infer<typeof S.IngestRequestSchema>;
export type FitRequest = z.infer<typeof S.FitRequestSchema>;
