'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

export interface ActionResult {
  ok?: boolean;
  error?: string;
  id?: string;
}

type WhoCanPost = 'members' | 'staff' | 'owner_and_followers';
type Visibility = 'public' | 'followers' | 'private';

const failed = (message?: string): ActionResult => ({
  error: message?.includes('Not allowed')
    ? 'Your role can look at channels but not change them.'
    : message?.includes('owner_cannot_be_muted')
      ? "The channel's owner can't be muted here."
      : message?.includes('groups_name_check')
        ? 'Use a name of 3 to 60 characters.'
        : "That didn't save. Try again.",
});

/**
 * Tell the channel's live conversation to re-read Postgres, so locks, mutes and settings reach
 * people who have the chat open. Postgres already enforces them if this fails.
 */
async function pushToChat(groupId: string) {
  const supabase = await serverSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  try {
    await fetch(`${process.env.CHAT_URL ?? 'http://127.0.0.1:8788'}/c/${groupId}/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch {
    // The chat Worker is down: Postgres still refuses posts, and sockets re-check within 60 s.
  }
}

export async function createOfficialChannel(
  name: string,
  description: string,
  whoCanPost: WhoCanPost,
  visibility: Visibility,
): Promise<ActionResult> {
  const clean = name.trim();
  if (clean.length < 3 || clean.length > 60) return { error: 'Use a name of 3 to 60 characters.' };
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('admin_create_official_channel', {
    p_name: clean,
    p_description: description.trim(),
    p_who_can_post: whoCanPost,
    p_visibility: visibility,
  });
  if (error) return failed(error.message);
  revalidatePath('/community');
  return { ok: true, id: data };
}

export async function saveChannelSettings(
  groupId: string,
  patch: { visibility: Visibility; who_can_post: WhoCanPost; slow_mode_seconds: number; muted_words: string[] },
): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('admin_update_channel', { p_group: groupId, p_patch: patch });
  if (error) return failed(error.message);
  await pushToChat(groupId);
  revalidatePath(`/community/${groupId}`);
  return { ok: true };
}

/** Lock chat / mute channel for 24 hours (null opens it again). Only `field` changes. */
export async function setChannelState(
  groupId: string,
  field: 'lock' | 'mute',
  until: string | null,
): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('admin_set_channel_state', {
    p_group: groupId,
    p_field: field,
    p_until: until as string,
  });
  if (error) return failed(error.message);
  await pushToChat(groupId);
  revalidatePath(`/community/${groupId}`);
  revalidatePath('/community');
  return { ok: true };
}

export async function muteMember(groupId: string, userId: string, until: string | null): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('admin_mute_member', {
    p_group: groupId,
    p_user: userId,
    p_until: until as string,
  });
  if (error) return failed(error.message);
  await pushToChat(groupId);
  revalidatePath(`/community/${groupId}`);
  return { ok: true };
}
