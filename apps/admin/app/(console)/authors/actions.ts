'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

type Result = { ok: true } | { ok: false; error: string };

/** Suspend author rights (suspend_author): Super admin or Support lead; live books stay readable. */
export async function suspendAuthor(userId: string, reason: string): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('suspend_author', { p_user: userId, p_reason: reason });
  if (error) {
    if (error.message.includes('reason_required')) return { ok: false, error: 'Write the reason first. It is kept in the audit log.' };
    if (error.message.includes('not_active_author')) return { ok: false, error: 'This author is already suspended.' };
    if (error.code === '42501') return { ok: false, error: 'Only a Super admin or Support lead can suspend an author.' };
    return { ok: false, error: "Couldn't suspend the author. Try again." };
  }
  revalidatePath(`/authors/${userId}`);
  revalidatePath('/authors');
  return { ok: true };
}

/** Give author rights back (reinstate_author). */
export async function reinstateAuthor(userId: string): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('reinstate_author', { p_user: userId });
  if (error) {
    if (error.message.includes('not_suspended')) return { ok: false, error: 'This author is not suspended.' };
    if (error.code === '42501') return { ok: false, error: 'Only a Super admin or Support lead can reinstate an author.' };
    return { ok: false, error: "Couldn't reinstate the author. Try again." };
  }
  revalidatePath(`/authors/${userId}`);
  revalidatePath('/authors');
  return { ok: true };
}

/** Staff message to the author (staff_message_author): a push and a notification; audited. */
export async function messageAuthor(userId: string, body: string): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_message_author', { p_author: userId, p_body: body });
  if (error) {
    if (error.message.includes('bad_body')) return { ok: false, error: 'Write 1 to 300 characters.' };
    if (error.message.includes('not_author')) return { ok: false, error: 'This person is not an author.' };
    if (error.code === '42501') return { ok: false, error: 'Your role can look at authors but not message them.' };
    return { ok: false, error: "The message didn't send. Try again." };
  }
  return { ok: true };
}

/** Edit the author's public profile (staff_update_author_profile): pen name, bio, location; audited. */
export async function editAuthorProfile(
  userId: string,
  profile: { penName: string; bio: string; location: string },
): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_update_author_profile', {
    p_author: userId,
    p_pen_name: profile.penName,
    p_bio: profile.bio,
    p_location: profile.location,
  });
  if (error) {
    if (error.message.includes('bad_pen_name')) return { ok: false, error: 'The pen name needs 1 to 60 characters.' };
    if (error.message.includes('bad_bio')) return { ok: false, error: 'The bio can be up to 300 characters.' };
    if (error.message.includes('bad_location')) return { ok: false, error: 'The location can be up to 60 characters.' };
    if (error.message.includes('not_author')) return { ok: false, error: 'This person is not an author.' };
    if (error.code === '42501') return { ok: false, error: 'Your role can look at authors but not edit them.' };
    return { ok: false, error: "The profile didn't save. Try again." };
  }
  revalidatePath(`/authors/${userId}`);
  revalidatePath('/authors');
  return { ok: true };
}
