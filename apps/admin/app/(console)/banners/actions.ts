'use server';

import { revalidatePath } from 'next/cache';
import type { Json } from '@arpedia/core';
import { serverSupabase } from '@/lib/supabase/server';

export interface ActionResult {
  ok?: boolean;
  error?: string;
  id?: string;
}

const failed = (message?: string): ActionResult => {
  if (message && /insufficient|Not allowed/i.test(message)) return { error: "Your role can't do that." };
  if (message && /^(Headline|Text is|Add a|Image must|Links can|Choose|Unknown|Announcement)/.test(message))
    return { error: message.endsWith('.') ? message : `${message}.` };
  return { error: "That didn't save. Try again." };
};

export interface BannerFields {
  placement: 'home_top' | 'credits' | 'launch_modal';
  headline: string;
  body: string;
  button_label: string;
  target: Json | null;
  image_url: string | null;
  audience: Json;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  dismissible: boolean;
  publish: boolean;
}

export async function saveBanner(id: string | null, fields: BannerFields): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('staff_save_banner', {
    // null creates a new announcement (the generated type can't say a uuid argument may be null).
    p_id: id as string,
    p_fields: fields as unknown as Json,
  });
  if (error) return failed(error.message);
  revalidatePath('/banners');
  return { ok: true, id: data };
}

export async function endBanner(id: string): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_end_banner', { p_id: id });
  if (error) return failed(error.message);
  revalidatePath('/banners');
  return { ok: true };
}
