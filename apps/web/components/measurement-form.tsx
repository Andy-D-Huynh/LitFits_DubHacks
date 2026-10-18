'use client';

import {
  FitPreferenceSchema,
  type FitPreference,
  type MeasurementKey,
  type Profile,
} from '@fitmirror/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

// Minimal manual-entry form (centimeters only for now; build-plan question 8).
const FIELDS: { key: MeasurementKey; label: string }[] = [
  { key: 'chest', label: 'Chest' },
  { key: 'waist', label: 'Waist' },
  { key: 'hip', label: 'Hip' },
  { key: 'shoulder_width', label: 'Shoulder width' },
  { key: 'inseam', label: 'Inseam' },
  { key: 'arm_length', label: 'Arm length' },
];

const inputClass = 'w-28 rounded-md border bg-background px-2 py-1.5';

export function MeasurementForm({ initial, demo }: { initial: Profile | null; demo: boolean }) {
  const router = useRouter();
  const [height, setHeight] = useState(initial ? String(initial.heightCm) : '');
  const [fitPreference, setFitPreference] = useState<FitPreference>(
    initial?.fitPreference ?? 'regular',
  );
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(FIELDS.map(({ key }) => [key, String(initial?.measurements[key] ?? '')])),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const query = demo ? '?demo=1' : '';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const measurements = Object.fromEntries(
      Object.entries(values)
        .filter(([, v]) => v.trim() !== '')
        .map(([k, v]) => [k, Number(v)]),
    );
    const res = await fetch(`/api/profile${query}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ heightCm: Number(height), fitPreference, measurements }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `Saving failed (${res.status})`);
      return;
    }
    router.push(`/studio${query}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="flex items-center gap-3 text-sm">
        <span className="w-32">Height</span>
        <input
          className={inputClass}
          type="number"
          step="0.1"
          required
          value={height}
          onChange={(e) => setHeight(e.target.value)}
        />
        <span className="text-muted-foreground">cm</span>
      </label>
      {FIELDS.map(({ key, label }) => (
        <label key={key} className="flex items-center gap-3 text-sm">
          <span className="w-32">{label}</span>
          <input
            className={inputClass}
            type="number"
            step="0.1"
            value={values[key]}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
          <span className="text-muted-foreground">cm</span>
        </label>
      ))}
      <label className="flex items-center gap-3 text-sm">
        <span className="w-32">Fit preference</span>
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
      {error && <p className="text-destructive text-sm">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save measurements'}
      </button>
    </form>
  );
}
