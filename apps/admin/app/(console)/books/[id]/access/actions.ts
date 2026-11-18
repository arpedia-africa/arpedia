'use server';

import { revalidatePath } from 'next/cache';
import { chapterPrices } from '@arpedia/core';
import { serverSupabase } from '@/lib/supabase/server';

type Result = { ok: true; message: string } | { ok: false; error: string; needCode?: boolean };

type Chapter = { chapter_uid: string; ord: number; pages: number; free: boolean };

/** Fresh two-step proof for a price change: verify the code, which renews the session's AAL2 time. */
async function verifyCode(code: string): Promise<string | null> {
  const supabase = await serverSupabase();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.find(f => f.status === 'verified');
  if (!factor) return 'Set up two-step sign-in first.';
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.replace(/\s/g, '') });
  return error ? "That code didn't work. Check your authenticator and try again." : null;
}

/**
 * Override the book price, or remove the override (price null). Chapter prices are spread over the
 * chargeable chapters with packages/core chapterPrices; admin_set_book_price checks they add up and
 * writes the price history and the audit log (flow 03 admin rule 2).
 */
export async function setBookPrice(
  bookId: string,
  price: number | null,
  reason: string,
  code: string,
  chapters: Chapter[],
  computed: number,
): Promise<Result> {
  if (!reason.trim()) return { ok: false, error: 'Add a reason. It goes in the price history.' };
  if (price !== null && (!Number.isInteger(price) || price < 1))
    return { ok: false, error: 'Enter a whole number of credits, 1 or more.' };
  const bad = await verifyCode(code);
  if (bad) return { ok: false, error: bad, needCode: true };

  const target = price ?? computed;
  const sorted = [...chapters].sort((a, b) => a.ord - b.ord);
  const weights = sorted.map(c => (c.free ? 0 : Number(c.pages)));
  let prices: number[];
  try {
    prices = chapterPrices(weights.some(w => w > 0) ? target : 0, weights);
  } catch {
    return { ok: false, error: "This book's chapters can't carry that price. Check the chapter table." };
  }
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('admin_set_book_price', {
    p_book: bookId,
    p_price: price as number,
    p_reason: reason.trim(),
    p_prices: sorted.map((c, i) => ({ chapter_uid: c.chapter_uid, price_credits: prices[i]! })),
  });
  if (error) {
    if (error.code === '42501') return { ok: false, error: 'Only Super admins and Finance can change prices, with a fresh two-step code.', needCode: true };
    return { ok: false, error: "Couldn't save the price. Nothing changed. Try again." };
  }
  const r = data as { old: number; new: number };
  revalidatePath(`/books/${bookId}`, 'layout');
  return {
    ok: true,
    message:
      price === null
        ? `Override removed. The price is back to ${r.new} credits.`
        : `Price changed from ${r.old} to ${r.new} credits. Readers who already unlocked keep access.`,
  };
}

/** Override the free preview (5–25%) or remove it (null). The new cut goes live when the rebuild finishes. */
export async function setPreview(bookId: string, percent: number | null, reason: string): Promise<Result> {
  if (!reason.trim()) return { ok: false, error: 'Add a reason. It goes in the audit log.' };
  if (percent !== null && (!Number.isFinite(percent) || percent < 5 || percent > 25))
    return { ok: false, error: 'Preview must be between 5% and 25%.' };
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('admin_set_preview', {
    p_book: bookId,
    p_percent: percent as number,
    p_reason: reason.trim(),
  });
  if (error) {
    if (error.code === '42501') return { ok: false, error: 'Only Publishers and Super admins can change the preview.' };
    return { ok: false, error: "Couldn't save the preview. Nothing changed. Try again." };
  }
  revalidatePath(`/books/${bookId}`, 'layout');
  return {
    ok: true,
    message:
      percent === null
        ? 'Preview back to 10%. Readers see it once the preview is rebuilt.'
        : `Preview set to ${percent}%. Readers see it once the preview is rebuilt; anyone already past it is not affected.`,
  };
}
