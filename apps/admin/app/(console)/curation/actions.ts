'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

type Result = { ok: boolean; error?: string };

const denied = (code?: string) =>
  code === '42501' ? 'Only Publishers, Operations admins and Super admins curate Discover.' : null;

/** Show or hide a Home section (live in the app within a minute; audited). */
export async function setSectionVisible(id: string, visible: boolean): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('update_home_section', { p_id: id, p_visible: visible });
  if (error) return { ok: false, error: denied(error.code) ?? "Couldn't save that. Try again." };
  revalidatePath('/curation');
  return { ok: true };
}

/** Change a section's config (weekly rotation, interest weight). */
export async function setSectionConfig(id: string, config: Record<string, unknown>): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('update_home_section', { p_id: id, p_config: config as never });
  if (error)
    return {
      ok: false,
      error: denied(error.code) ?? (error.message.includes('between 0 and 1') ? 'Pick a weight from 0 to 100%.' : "Couldn't save that. Try again."),
    };
  revalidatePath('/curation');
  return { ok: true };
}

/** New order, every section listed top to bottom (saved as you go). */
export async function reorderSections(ids: string[]): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('reorder_home_sections', { p_ids: ids });
  if (error) return { ok: false, error: denied(error.code) ?? "Couldn't save the order. Try again." };
  revalidatePath('/curation');
  return { ok: true };
}

/** Save a Coming soon entry; a new release time also moves the book's schedule. */
export async function saveComingSoon(bookId: string, teaser: string, releaseAt: string | null): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('save_coming_soon', {
    p_book: bookId,
    p_teaser: teaser,
    p_release_at: releaseAt ?? undefined,
  });
  if (error)
    return {
      ok: false,
      error:
        denied(error.code) ??
        (error.message.includes('140') ? 'Keep the teaser to 140 characters.' : "Couldn't save the entry. Try again."),
    };
  revalidatePath('/curation');
  return { ok: true };
}

/** Live books whose title or author matches (Add a book). */
export async function findBooks(q: string): Promise<{ id: string; title: string; author: string }[]> {
  const term = q.trim().replace(/[%_,()]/g, ' ');
  if (term.length < 2) return [];
  const supabase = await serverSupabase();
  const { data } = await supabase
    .from('catalog_books')
    .select('id, title, author_name')
    .or(`title.ilike.%${term}%,author_name.ilike.%${term}%`)
    .order('title')
    .limit(8);
  return (data ?? []).map(b => ({ id: b.id!, title: b.title ?? '', author: b.author_name ?? '' }));
}

/** Replace the section's draft (Trending edits). Items in order. */
export async function saveDraft(
  sectionId: string,
  items: { item_type: 'book' | 'author'; item_id: string; pinned?: boolean; excluded?: boolean }[],
): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('save_shelf_draft', { p_section: sectionId, p_items: items as never });
  if (error) return { ok: false, error: denied(error.code) ?? "Couldn't save the draft. Try again." };
  return { ok: true };
}

export async function discardDraft(sectionId: string): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('discard_shelf_draft', { p_section: sectionId });
  if (error) return { ok: false, error: denied(error.code) ?? "Couldn't discard. Try again." };
  revalidatePath('/curation');
  return { ok: true };
}

/** Publish the draft: replaces the live shelf in one go (Trending: 10 books at most). */
export async function publishShelf(sectionId: string): Promise<Result & { live?: number }> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('publish_shelf', { p_section: sectionId });
  if (error) {
    const m = error.message;
    return {
      ok: false,
      error:
        denied(error.code) ??
        (m.includes('at most 10')
          ? 'Trending holds 10 books at most. Remove one first.'
          : m.includes('no changes')
            ? 'Nothing to publish yet.'
            : m.includes('only live books')
              ? 'One of these books is no longer live. Remove it and publish again.'
              : "Couldn't publish. Try again."),
    };
  }
  revalidatePath('/curation');
  return { ok: true, live: data ?? 0 };
}
