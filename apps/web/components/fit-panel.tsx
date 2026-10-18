'use client';

import {
  CategorySchema,
  FitPreferenceSchema,
  computeFit,
  type FitPreference,
  type FitVerdict,
  type GarmentFixture,
  type Measurements,
} from '@fitmirror/shared';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

// Colors follow docs/ui.md: green good, red tight, blue loose.
const VERDICT_STYLE: Record<FitVerdict, string> = {
  good: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  tight: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  loose: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  unknown: 'bg-muted text-muted-foreground',
};

const MEASUREMENT_LABELS: Record<keyof Measurements, string> = {
  chest: 'chest',
  waist: 'waist',
  hip: 'hip',
  shoulder_width: 'shoulder',
  inseam: 'inseam',
  arm_length: 'arm',
};

export function FitPanel({
  garments,
  measurements,
}: {
  garments: GarmentFixture[];
  measurements: Measurements;
}) {
  const [garmentId, setGarmentId] = useState(garments[0]?.id ?? '');
  const [fitPreference, setFitPreference] = useState<FitPreference>('regular');
  const garment = garments.find((g) => g.id === garmentId);

  const fit = useMemo(
    () =>
      garment
        ? computeFit(garment, { measurements, measurementSource: null, fitPreference })
        : null,
    [garment, measurements, fitPreference],
  );

  return (
    <section className="space-y-4 rounded-lg border p-4" aria-labelledby="fit-panel-title">
      <h2 id="fit-panel-title" className="text-lg font-semibold">
        Fit
      </h2>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Garment
          <select
            className="rounded-md border bg-background px-2 py-1.5"
            value={garmentId}
            onChange={(e) => setGarmentId(e.target.value)}
          >
            {CategorySchema.options.map((category) => (
              <optgroup key={category} label={category}>
                {garments
                  .filter((g) => g.category === category)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name ?? g.id}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Fit preference
          <select
            className="rounded-md border bg-background px-2 py-1.5"
            value={fitPreference}
            onChange={(e) => setFitPreference(FitPreferenceSchema.parse(e.target.value))}
          >
            {FitPreferenceSchema.options.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-muted-foreground text-xs">
        Hardcoded measurements (cm):{' '}
        {Object.entries(measurements)
          .map(([k, v]) => `${MEASUREMENT_LABELS[k as keyof Measurements]} ${v}`)
          .join(' · ')}
      </p>

      {garment?.placeholder && (
        <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Placeholder size chart, not real retailer data.
        </p>
      )}

      {fit && (
        <>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-semibold">
              {fit.recommendedSize ? `Size ${fit.recommendedSize}` : 'No recommendation'}
            </span>
            <span className="text-muted-foreground text-sm">{fit.confidence} confidence</span>
          </div>

          {fit.warnings.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-300">
              {fit.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          <ol className="space-y-3">
            {fit.perSize.map((s) => (
              <li
                key={s.size}
                className={cn(
                  'rounded-md border p-3',
                  s.size === fit.recommendedSize && 'ring-primary ring-2',
                )}
              >
                <div className="mb-2 flex items-center gap-3">
                  <span className="w-10 font-semibold">{s.size}</span>
                  <span
                    className={cn(
                      'rounded px-2 py-0.5 text-xs font-medium',
                      VERDICT_STYLE[s.overall],
                    )}
                  >
                    {s.overall}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    score {Math.round(s.score * 100)}%
                  </span>
                </div>
                <ul className="space-y-0.5 text-sm">
                  {s.dims.map((d) => (
                    <li key={d.dim}>{d.note}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
