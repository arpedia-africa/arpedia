'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';

export interface ActionResult {
  ok?: boolean;
  error?: string;
  version?: number;
  sentTo?: string;
}

const failed = (message?: string): ActionResult => {
  if (message && /insufficient|Not allowed/i.test(message)) return { error: "Your role can't do that." };
  if (message && /^(Unknown variable|This email|From must|Reply-to must)/.test(message))
    return { error: message.endsWith('.') ? message : `${message}.` };
  return { error: "That didn't save. Try again." };
};

export async function saveTemplate(
  key: string,
  draft: { subject: string; preheader: string; body: string; enabled?: boolean },
): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('staff_save_email_template', {
    p_key: key,
    p_subject: draft.subject,
    p_preheader: draft.preheader,
    p_body: draft.body,
    p_enabled: draft.enabled,
  });
  if (error) return failed(error.message);
  revalidatePath('/emails');
  return { ok: true, version: data };
}

export async function saveSender(from: string, replyTo: string, footer: string): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_save_email_sender', { p_from: from, p_reply_to: replyTo, p_footer: footer });
  if (error) return failed(error.message);
  revalidatePath('/emails');
  return { ok: true };
}

/** The api Worker sends the draft as typed to the signed-in staff address. */
export async function sendTest(draft: { subject: string; preheader: string; body: string }): Promise<ActionResult> {
  const supabase = await serverSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: 'Your session ended. Sign in again.' };
  try {
    const r = await fetch(`${process.env.ARPEDIA_API_URL ?? 'http://127.0.0.1:8787'}/v1/engage/emails/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const j = (await r.json().catch(() => ({}))) as { sent_to?: string; error?: string };
    if (!r.ok) return { error: j.error ? `${j.error}.` : "The test email didn't send. Try again." };
    return { ok: true, sentTo: j.sent_to };
  } catch {
    return { error: "The test email didn't send. Check the api Worker is running." };
  }
}
