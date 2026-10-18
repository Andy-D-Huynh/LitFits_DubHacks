import 'server-only';
import type { Garment } from '@fitmirror/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rowToGarment, type GarmentRow } from '../db/garments';
import { findFixtureGarment, loadFixtureGarments } from '../fixtures';

// Garments are a shared catalog (public read). Demo mode reads fixtures only.
export type GarmentSource = { demo: true } | { demo: false; supabase: SupabaseClient };

export async function listGarments(src: GarmentSource): Promise<Garment[]> {
  if (src.demo) return loadFixtureGarments();
  const { data, error } = await src.supabase
    .from('garments')
    .select('*')
    .order('category')
    .order('name')
    .returns<GarmentRow[]>();
  if (error) throw new Error(`Loading garments failed: ${error.message}`);
  return data.map(rowToGarment);
}

export async function getGarment(src: GarmentSource, id: string): Promise<Garment | null> {
  if (src.demo) return findFixtureGarment(id) ?? null;
  const { data, error } = await src.supabase
    .from('garments')
    .select('*')
    .eq('id', id)
    .maybeSingle<GarmentRow>();
  if (error) throw new Error(`Loading garment failed: ${error.message}`);
  return data ? rowToGarment(data) : null;
}

export async function getGarments(src: GarmentSource, ids: string[]): Promise<Garment[]> {
  if (ids.length === 0) return [];
  if (src.demo) return ids.map(findFixtureGarment).filter((g): g is Garment => Boolean(g));
  const { data, error } = await src.supabase
    .from('garments')
    .select('*')
    .in('id', ids)
    .returns<GarmentRow[]>();
  if (error) throw new Error(`Loading garments failed: ${error.message}`);
  return data.map(rowToGarment);
}
