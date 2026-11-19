'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

export async function assignTicketToMe(ticketId: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('update_ticket', { p_ticket: ticketId });
  if (error) return { error: error.message.includes('not allowed') ? 'Your role cannot answer support.' : "That didn't save. Try again." };
  revalidatePath('/support');
  return { ok: true };
}
