'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';
import type { HelpCategory } from './labels';

export interface ActionResult {
  ok?: boolean;
  error?: string;
  articleId?: string;
}

export interface HelpDraft {
  articleId: string | null;
  slug: string;
  category: HelpCategory;
  showsIn: string[];
  title: string;
  body: string;
  inSearch: boolean;
}

function failure(m: string): ActionResult {
  if (m.includes('help_articles_slug_key'))
    return { error: 'Another article already uses this web address. Change the title.' };
  if (m.includes('slug_check'))
    return { error: 'The title needs at least one letter or number for its web address.' };
  if (m.includes('shows_in_check')) return { error: 'Show it in the app, on the website, or both.' };
  if (m.includes('title_check')) return { error: 'Add a title (up to 120 characters).' };
  if (m.includes('not allowed')) return { error: 'Your role can’t edit help articles.' };
  return { error: "That didn't save. Nothing changed. Try again." };
}

/** save_help_draft (a new version) then set_help_extras (search suggestion). */
export async function saveHelpDraft(d: HelpDraft): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('save_help_draft', {
    p_article: d.articleId as string, // null makes a new article
    p_slug: d.slug,
    p_category: d.category,
    p_shows_in: d.showsIn,
    p_title: d.title,
    p_body: d.body,
  });
  if (error) return failure(error.message);
  const articleId = (data as { article_id: string }).article_id;
  const extras = await supabase.rpc('set_help_extras', {
    p_article: articleId,
    p_related: null as unknown as string[],
    p_in_search: d.inSearch,
  });
  if (extras.error) return failure(extras.error.message);
  revalidatePath('/help');
  return { ok: true, articleId };
}

/** Publish the latest version: live in the app and on the website within a minute. */
export async function publishHelp(articleId: string): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('publish_help_article', { p_article: articleId });
  if (error) return failure(error.message);
  revalidatePath('/help');
  return { ok: true, articleId };
}

/** Related articles show under the article in the app straight away. */
export async function setRelated(articleId: string, related: string[]): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('set_help_extras', {
    p_article: articleId,
    p_related: related,
    p_in_search: null as unknown as boolean,
  });
  if (error) return failure(error.message);
  revalidatePath(`/help/${articleId}`);
  return { ok: true, articleId };
}
