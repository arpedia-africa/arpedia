import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Href } from 'expo-router';
import { REVIEW_SLA_DAYS, type Database, type Json } from '@arpedia/core';
import { supabase } from '@/lib/supabase';
import { isNetworkError } from '../01/session';

/** The applicant's view: review internals (checks, SLA alert, legacy) are not granted to them. */
export type Application = Omit<
  Database['public']['Tables']['author_applications']['Row'],
  'checks' | 'sla_alerted_at' | 'legacy' | '_applicant_view'
>;
// One literal, so supabase-js can type the select.
const APPLICANT_COLUMNS =
  'id, user_id, status, step_reached, legal_name, email, phone, pen_name, social_handle, date_of_birth, state, categories, bio, experience, sample_file_key, sample_file_name, sample_text, sample_pages, sample_excerpt, agreement_version, agreement_accepted_at, submitted_at, assigned_to, decided_by, decided_at, decision_reason, reapply_after, info_request, info_step, created_at, updated_at';
export type DraftPatch = Partial<
  Pick<
    Application,
    | 'legal_name'
    | 'email'
    | 'phone'
    | 'pen_name'
    | 'social_handle'
    | 'date_of_birth'
    | 'state'
    | 'categories'
    | 'bio'
    | 'experience'
    | 'sample_text'
    | 'sample_file_key'
  >
> & { step?: number };

export { APPLICATION_CATEGORIES as CATEGORIES } from '@arpedia/core';

/** Author Studio home (flow 11 app screens, next step of this flow). */
export const STUDIO = '/studio' as Href;

/** Admin promise (open question 2): the reply-by date is 5 days after sending. */
export const REVIEW_DAYS = REVIEW_SLA_DAYS;

const api = process.env.EXPO_PUBLIC_API_URL ?? '';
/** Unsaved draft edits, per account, so another account on this phone never sends them. */
const pendingKey = (uid: string) => `arpedia.apply.pending.${uid}`;

export const applicationKey = (uid: string | undefined) => ['author-application', uid] as const;

/** The caller's latest application, without opening one (Become an author, Studio entry). */
export function useLatestApplication(uid: string | undefined) {
  return useQuery({
    queryKey: [...applicationKey(uid), 'latest'],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('author_applications')
        .select(APPLICANT_COLUMNS)
        .eq('user_id', uid!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Whether the signed-in user is an approved author (`profiles.is_author`, server-only). */
export function useIsAuthor(uid: string | undefined) {
  return useQuery({
    queryKey: ['is-author', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('is_author').eq('id', uid!).single();
      if (error) throw error;
      return data.is_author;
    },
  });
}

/** Opens (or returns) the open application, prefilled from the account (rule 3). */
export function useApplication(uid: string | undefined) {
  return useQuery({
    queryKey: applicationKey(uid),
    enabled: !!uid,
    retry: (n, e) => n < 2 && isNetworkError(e),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('start_application');
      if (error) throw error;
      return data;
    },
  });
}

/** P0001 errors carry the code as the message and JSON in details. */
export function rpcCode(e: unknown): { code: string; detail: Record<string, unknown> } {
  const err = e as { message?: string; details?: string } | null;
  let detail: Record<string, unknown> = {};
  try {
    detail = err?.details ? (JSON.parse(err.details) as Record<string, unknown>) : {};
  } catch {
    // plain-text details
  }
  return { code: err?.message ?? 'unknown', detail };
}

async function readPending(uid: string): Promise<DraftPatch> {
  try {
    return JSON.parse((await AsyncStorage.getItem(pendingKey(uid))) ?? '{}') as DraftPatch;
  } catch {
    return {};
  }
}

async function writePending(uid: string, p: DraftPatch) {
  try {
    if (Object.keys(p).length) await AsyncStorage.setItem(pendingKey(uid), JSON.stringify(p));
    else await AsyncStorage.removeItem(pendingKey(uid));
  } catch {
    // storage full or blocked: the in-memory patch still saves while online
  }
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

/**
 * Drafts save as the user types (rule 4): edits merge into one pending patch, kept on the phone
 * until the server has it, and flushed 1 second after the last change, on Save draft, and when
 * the connection comes back (States: offline drafts queue locally and sync).
 */
export function useDraftSaver(uid: string | undefined) {
  const qc = useQueryClient();
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushing = useRef<Promise<boolean> | null>(null);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (flushing.current) await flushing.current;
    const run = (async () => {
      if (!uid) return true;
      const patch = await readPending(uid);
      if (!Object.keys(patch).length) return true;
      setState('saving');
      const { data, error } = await supabase.rpc('save_application_draft', { p_patch: patch as Json });
      // Keep anything typed while this save was on its way.
      const now = await readPending(uid);
      const rest: DraftPatch = {};
      for (const k of Object.keys(now) as (keyof DraftPatch)[]) {
        if (JSON.stringify(now[k]) !== JSON.stringify(patch[k])) Object.assign(rest, { [k]: now[k] });
      }
      if (error) {
        if (isNetworkError(error)) {
          setState('offline');
          return false;
        }
        // The server refused this patch (sent already, bad value): retrying it would fail forever.
        await writePending(uid, rest);
        setState('error');
        return false;
      }
      await writePending(uid, rest);
      qc.setQueryData(applicationKey(uid), data);
      setState('saved');
      return true;
    })();
    flushing.current = run;
    try {
      return await run;
    } finally {
      flushing.current = null;
    }
  }, [qc, uid]);

  const queue = useCallback(
    (patch: DraftPatch) => {
      void (async () => {
        if (!uid) return;
        await writePending(uid, { ...(await readPending(uid)), ...patch });
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), 1000);
      })();
    },
    [flush, uid],
  );

  useEffect(() => {
    void flush();
    const off = NetInfo.addEventListener((s) => {
      if (s.isConnected) void flush();
    });
    return () => {
      off();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);

  return { state, queue, flush };
}

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token || !api) throw new Error('not_ready');
  return { Authorization: `Bearer ${token}` };
}

export interface PickedSample {
  name: string;
  size: number;
  pages: number | null;
}

export class SampleError extends Error {}

const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * Pick a .docx or .pdf, upload it to R2 through the Worker's signed URL, then let the Worker
 * check it (type, 5 MB, up to 10 pages) and attach it to the draft (rule 5). Returns null if the
 * user cancelled. Plain-language problems come back as SampleError (no draft loss).
 */
export async function pickAndUploadSample(): Promise<PickedSample | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: Object.values(TYPES),
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets[0]) return null;
  const file = res.assets[0];
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const contentType = TYPES[ext];
  if (!contentType) throw new SampleError('Use a Word (.docx) or PDF file, or paste your text.');
  const blob = await (await fetch(file.uri)).blob();
  const auth = await authHeader();
  const ticket = await fetch(`${api}/v1/author-applications/sample/upload`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_name: file.name, content_type: contentType, size: blob.size }),
  });
  const t = (await ticket.json().catch(() => ({}))) as {
    upload_url?: string;
    key?: string;
    message?: string;
  };
  if (!ticket.ok || !t.upload_url || !t.key)
    throw new SampleError(t.message ?? 'Upload didn’t start. Try again.');
  // The object route refuses a PUT without the body's SHA-256 (flow 12).
  const bytes = await blob.arrayBuffer();
  const sha = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  const hex = [...new Uint8Array(sha)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const put = await fetch(t.upload_url, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': contentType, 'X-Content-SHA256': hex },
    body: bytes,
  });
  if (!put.ok) throw new SampleError('Upload didn’t finish. Try again.');
  const done = await fetch(`${api}/v1/author-applications/sample/complete`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: t.key, file_name: file.name }),
  });
  const d = (await done.json().catch(() => ({}))) as { sample_pages?: number | null; message?: string };
  if (!done.ok) throw new SampleError(d.message ?? 'We could not check this file. Try again.');
  return { name: file.name, size: blob.size, pages: d.sample_pages ?? null };
}

/** "220 KB", "1.4 MB". */
export function fileSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "Monday 16 November" in Lagos time. */
export function longDate(iso: string, addDays = 0) {
  const d = new Date(new Date(iso).getTime() + addDays * 86_400_000);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Africa/Lagos',
  });
}

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Africa/Lagos',
  });
}
