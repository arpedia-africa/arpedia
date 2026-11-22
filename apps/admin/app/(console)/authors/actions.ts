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
