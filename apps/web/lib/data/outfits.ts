import 'server-only';
import type { OutfitEntry, OutfitWithItems } from '@fitmirror/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { entryToRow, rowToOutfit, type OutfitRow } from '../db/outfits';

// All queries run as the caller; RLS limits them to outfits on the caller's profile.

const SELECT = '*, outfit_items(*)';

export async function listOutfits(supabase: SupabaseClient): Promise<OutfitWithItems[]> {
  const { data, error } = await supabase
    .from('outfits')
    .select(SELECT)
    .order('created_at', { ascending: false })
    .returns<OutfitRow[]>();
  if (error) throw new Error(`Loading outfits failed: ${error.message}`);
  return data.map(rowToOutfit);
}

export async function getOutfit(
  supabase: SupabaseClient,
  id: string,
): Promise<OutfitWithItems | null> {
  const { data, error } = await supabase
    .from('outfits')
    .select(SELECT)
    .eq('id', id)
    .maybeSingle<OutfitRow>();
  if (error) throw new Error(`Loading outfit failed: ${error.message}`);
  return data ? rowToOutfit(data) : null;
}

export async function createOutfit(
  supabase: SupabaseClient,
  profileId: string,
  name: string | null,
): Promise<OutfitWithItems> {
  const { data, error } = await supabase
    .from('outfits')
    .insert({ profile_id: profileId, name })
    .select(SELECT)
    .single<OutfitRow>();
  if (error) throw new Error(`Creating outfit failed: ${error.message}`);
  return rowToOutfit(data);
}

export async function deleteOutfit(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await supabase.from('outfits').delete().eq('id', id).select('id');
  if (error) throw new Error(`Deleting outfit failed: ${error.message}`);
  return data.length > 0;
}

// Writes the difference between two item lists: deletes emptied slots, then
// upserts new or changed entries. Not transactional (supabase-js has no
// transactions); the client reverts its optimistic state on an error.
export async function saveItems(
  supabase: SupabaseClient,
  outfitId: string,
  before: OutfitEntry[],
  after: OutfitEntry[],
): Promise<void> {
  const emptied = before.filter((b) => !after.some((a) => a.slot === b.slot)).map((b) => b.slot);
  if (emptied.length > 0) {
    const { error } = await supabase
      .from('outfit_items')
      .delete()
      .eq('outfit_id', outfitId)
      .in('slot', emptied);
    if (error) throw new Error(`Removing outfit items failed: ${error.message}`);
  }
  const changed = after.filter(
    (a) =>
      !before.some(
        (b) =>
          b.slot === a.slot &&
          b.garmentId === a.garmentId &&
          b.size === a.size &&
          b.position === a.position,
      ),
  );
  if (changed.length > 0) {
    const { error } = await supabase.from('outfit_items').upsert(
      changed.map((e) => entryToRow(outfitId, e)),
      { onConflict: 'outfit_id,slot' },
    );
    if (error) throw new Error(`Saving outfit items failed: ${error.message}`);
  }
}
