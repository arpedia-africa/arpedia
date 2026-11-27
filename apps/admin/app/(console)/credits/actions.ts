'use server';

import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase/server';
import { rpcError } from '@/lib/money';

type Result = { ok: true; message: string; status?: string } | { ok: false; error: string };

const n0 = (n: number) => n.toLocaleString('en-NG');

/** Freeze gifting with one tap, or lift it again (Undo). set_gifting_frozen is Finance and Super admin, with two-step. */
export async function setGiftingFrozen(frozen: boolean): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('set_gifting_frozen', { p_frozen: frozen });
  if (error) {
    return {
      ok: false,
      error: rpcError(error.code, error.message, { '42501': 'Only Finance and Super admins can freeze gifting.' }, "Couldn't change gifting. Nothing changed. Try again."),
    };
  }
  revalidatePath('/credits');
  return {
    ok: true,
    message: frozen
      ? 'Gifting is frozen for everyone. Readers can still read and spend credits.'
      : 'Gifting is back on.',
  };
}

/**
 * Freeze gifting on a gift-loop row (13 rule 4): the loop's gift credits are kept out of author
 * earnings, the alert closes, and gifting is frozen app-wide unless it already is. Undo lifts the
 * freeze only; the exclusion stays (it is append-only and the loop was confirmed).
 */
export async function freezeGiftLoop(alertId: number, alreadyFrozen: boolean): Promise<Result & { froze?: boolean }> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('exclude_gift_loop_alert', { p_alert: alertId });
  if (error) {
    return {
      ok: false,
      error: rpcError(
        error.code,
        error.message,
        { '42501': 'Only Finance and Super admins can keep credits out of earnings.', not_found: 'This alert is gone. Refresh the page.' },
        "Couldn't freeze this loop. Nothing changed. Try again.",
      ),
    };
  }
  let froze = false;
  if (!alreadyFrozen) {
    const f = await supabase.rpc('set_gifting_frozen', { p_frozen: true });
    froze = !f.error;
  }
  revalidatePath('/credits');
  const kept = data ? `${n0(data)} gift${data === 1 ? '' : 's'} in this loop won’t earn.` : 'This loop was already kept out of earnings.';
  return {
    ok: true,
    froze,
    message: froze ? `Gifting frozen for everyone. ${kept}` : alreadyFrozen ? kept : `${kept} Gifting couldn’t be frozen. Try Freeze gifting again.`,
  };
}

/** Approve or turn down a grant over 500 credits. A second person decides: not the one who asked. */
export async function decideGrant(requestId: string, approve: boolean): Promise<Result> {
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('decide_credit_grant', { p_request: requestId, p_approve: approve });
  if (error) {
    return {
      ok: false,
      error: rpcError(
        error.code,
        error.message,
        {
          '42501': 'Only Finance and Super admins can approve a grant.',
          same_person: 'You asked for this grant, so someone else has to approve it.',
          not_pending: 'This request was already decided.',
        },
        "Couldn't save the decision. Nothing changed. Try again.",
      ),
    };
  }
  revalidatePath('/credits');
  return { ok: true, message: approve ? 'Grant approved. The credits are in the reader’s balance.' : 'Grant turned down. Nothing was added.' };
}

/** Grant credits to a reader: up to 500 applies at once, over 500 waits for a second approver (rule 28). */
export async function grantCredits(userId: string, credits: number, reason: string): Promise<Result> {
  if (!Number.isInteger(credits) || credits < 1) return { ok: false, error: 'Enter a whole number of credits, 1 or more.' };
  if (reason.trim().length < 3) return { ok: false, error: 'Add a reason. It goes in the ledger and the audit log.' };
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('staff_grant_credits', {
    p_user: userId,
    p_credits: credits,
    p_reason: reason.trim(),
  });
  if (error) {
    return {
      ok: false,
      error: rpcError(
        error.code,
        error.message,
        {
          '42501': 'Your role can’t grant credits.',
          bad_amount: 'Enter a whole number of credits between 1 and 100,000.',
          reason_required: 'Add a reason. It goes in the ledger and the audit log.',
          unknown_user: 'We couldn’t find this reader.',
        },
        "Couldn't grant the credits. Nothing changed. Try again.",
      ),
    };
  }
  const r = data as unknown as { status: 'applied' | 'pending' };
  revalidatePath(`/credits/${userId}`);
  revalidatePath('/credits');
  return r.status === 'pending'
    ? {
        ok: true,
        status: 'pending',
        message: `${n0(credits)} credits need a second approver (Finance or Super admin). Nothing was added yet.`,
      }
    : { ok: true, status: 'applied', message: `${n0(credits)} credits added.` };
}

export type ReturnReason = 'skipped_by_mistake' | 'did_not_open' | 'wrong_book';

const RETURN_REASON = {
  skipped_by_mistake: 'skipped_ahead',
  did_not_open: 'did_not_open',
  wrong_book: 'wrong_book',
} as const;

/**
 * Support gives back a pay-as-you-read chapter charge once the reader's own undo window has ended
 * (flow 09 rule 30). Goes through flow 14's staff_return_chapter_charge, the one return path: over
 * 50 credits or a 4th return in 30 days waits for Finance, and a charge is returned once.
 */
export async function returnChapter(userId: string, chargeId: number, reason: ReturnReason): Promise<Result> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('staff_return_chapter_charge', {
    p_ledger: chargeId,
    p_reason: RETURN_REASON[reason],
  });
  if (error) {
    return {
      ok: false,
      error: rpcError(
        error.code,
        error.message,
        {
          '42501': 'Only Support and Finance can return a chapter charge.',
          not_chapter_charge: 'This isn’t a pay as you read chapter charge.',
          already_returned: 'This charge was already returned.',
          already_undone: 'The reader already undid this charge.',
          undo_window_open: 'The reader can still undo this themselves for a few more minutes.',
        },
        "Couldn't return the credits. Nothing changed. Try again.",
      ),
    };
  }
  const r = data as { state: 'done' | 'pending_approval'; credits: number; duplicate: boolean };
  revalidatePath(`/credits/${userId}`);
  if (r.state === 'pending_approval')
    return {
      ok: true,
      status: 'pending',
      message: `${n0(r.credits)} credits need Finance to approve (over 50 credits or a 4th return in 30 days). Nothing was returned yet.`,
    };
  return {
    ok: true,
    message: r.duplicate
      ? 'This charge was already returned.'
      : `${n0(r.credits)} credits returned. The chapter is locked again.`,
  };
}
