'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

export interface ActionResult {
  ok?: boolean;
  error?: string;
}

export type RoomAction = 'join_silently' | 'lock' | 'unlock' | 'end' | 'undo_end' | 'cancel' | 'mute' | 'transcript';

export interface TranscriptLine {
  id: string;
  sender_id: string | null;
  sender_name: string;
  body: string | null;
  state: string;
  created_at: string;
  spoiler_chapter: number;
}

const failed = (message?: string): ActionResult => ({
  error: message?.includes('Not allowed')
    ? 'Your role can look at rooms but not change them.'
    : message?.includes('undo_expired')
      ? 'Too late to undo. Rooms can be brought back within 10 minutes.'
      : message?.includes('room_ended')
        ? 'This room has ended.'
        : message?.includes('not_scheduled')
          ? 'This room has already started.'
          : "That didn't save. Try again.",
});

/**
 * Tell the room's live conversation to re-read Postgres, so locks, mutes and the end reach people
 * who have the chat open. Postgres already enforces them if this fails.
 */
async function pushToChat(roomId: string) {
  const supabase = await serverSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  try {
    await fetch(`${process.env.CHAT_URL ?? 'http://127.0.0.1:8788'}/c/${roomId}/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch {
    // The chat Worker is down: Postgres still refuses posts, and sockets re-check within 60 s.
  }
}

/** Staff room actions (all audited in Postgres). Mute: `until` null unmutes. */
export async function roomAction(
  roomId: string,
  action: RoomAction,
  opts: { user?: string; until?: string | null } = {},
): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('admin_room_action', {
    p_room: roomId,
    p_action: action,
    p_user: opts.user as string,
    p_until: (opts.until ?? null) as string,
  });
  if (error) return failed(error.message);
  if (action !== 'join_silently' && action !== 'transcript') await pushToChat(roomId);
  revalidatePath('/community/rooms');
  revalidatePath(`/community/rooms/${roomId}`);
  return { ok: true };
}

/** The newest messages, oldest first (watching after Join silently; no audit row per poll). */
export async function roomMessages(roomId: string, limit = 50): Promise<TranscriptLine[] | null> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('get_room_messages', { p_room: roomId, p_limit: limit });
  if (error) return null;
  return [...(data ?? [])].reverse().map(m => ({
    id: m.id,
    sender_id: m.sender_id,
    sender_name: m.sender_name,
    body: m.body,
    state: m.state,
    created_at: m.created_at,
    spoiler_chapter: m.spoiler_chapter,
  }));
}

/** The whole transcript as plain text (ended rooms keep it for 90 days). */
export async function roomTranscript(roomId: string): Promise<{ text?: string; error?: string }> {
  const supabase = await serverSupabase();
  // Audited before anything is read (and refused for roles that can't act on rooms).
  const audit = await supabase.rpc('admin_room_action', { p_room: roomId, p_action: 'transcript' });
  if (audit.error) return { error: failed(audit.error.message).error };
  type Row = TranscriptLine & { id: string };
  const all: Row[] = [];
  let before: { at: string; id: string } | null = null;
  for (let page = 0; page < 100; page++) {
    const { data, error }: { data: Row[] | null; error: { message: string } | null } = await supabase.rpc('get_room_messages', {
      p_room: roomId,
      p_limit: 100,
      ...(before ? { p_before: before.at, p_before_id: before.id } : {}),
    });
    if (error) return { error: "The transcript didn't download. Try again." };
    const rows: Row[] = data ?? [];
    all.push(...rows);
    if (rows.length < 100) break;
    const oldest: Row = rows.reduce((a, b) => (a.created_at < b.created_at ? a : b));
    before = { at: oldest.created_at, id: oldest.id };
  }
  all.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Lagos',
    });
  const text = all
    .map(m => {
      const body = m.state === 'deleted' ? '[deleted]' : m.state === 'visible' ? (m.body ?? '') : `[${m.state.replace('_', ' ')}] ${m.body ?? ''}`;
      return `${fmt(m.created_at)}  ${m.sender_name}: ${body}`;
    })
    .join('\n');
  return { text };
}
