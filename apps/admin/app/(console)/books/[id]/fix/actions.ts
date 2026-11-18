'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export type Op =
  | { op: 'rename_chapter'; chapter_uid: string; title: string }
  | { op: 'dismiss_flag'; reason: string };

type Fixed = { fix_id: string; work_version: number; readiness: number; blocking: boolean };
export type FixResult = { ok: true; fixId: string; version: number } | { ok: false; error: string };

/** Accept suggestion (no `op`), or a structured edit for the flag (rule 30), through the Worker. */
export async function fixFlag(revisionId: string, flagId: string, expectedVersion: number, op?: Op): Promise<FixResult> {
  const r = await api<Fixed>('/v1/books/fix', {
    revision_id: revisionId,
    flag_id: flagId,
    expected_version: expectedVersion,
    ...(op ? { op } : {}),
  });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(`/books/${revisionId}/fix`);
  return { ok: true, fixId: r.data.fix_id, version: r.data.work_version };
}

/** Undo restores the working copy from before the fix. */
export async function undoFix(revisionId: string, fixId: string, expectedVersion: number) {
  const r = await api<{ work_version: number }>('/v1/books/fix/undo', {
    fix_id: fixId,
    expected_version: expectedVersion,
  });
  if (!r.ok) return { ok: false as const, error: r.error };
  revalidatePath(`/books/${revisionId}/fix`);
  return { ok: true as const };
}

/** Mark fixed and send to review (rule 32): the Worker reseals what changed, then routes. */
export async function release(revisionId: string) {
  const r = await api<{ status: string }>('/v1/books/release', { revision_id: revisionId });
  if (!r.ok) return { ok: false as const, error: r.error };
  revalidatePath('/books');
  return { ok: true as const };
}

/** A short-lived link to the author's original file. */
export async function originalUrl(revisionId: string) {
  const r = await api<{ url: string }>('/v1/books/source-url', { revision_id: revisionId });
  return r.ok ? { ok: true as const, url: r.data.url } : { ok: false as const, error: r.error };
}
