import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';
import type { Href } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { isNetworkError } from '../01/session';
import type { SourceType, SubmitValues } from './SubmitViews';

// Guided submit (rules 17–23) over flow 12's Worker: POST /v1/books/upload → PUT the files to the
// signed links → POST /v1/books/finalize → poll /v1/books/status/:id → POST /v1/books/confirm →
// POST /v1/books/submit.

const api = process.env.EXPO_PUBLIC_API_URL ?? '';

export const SUBMIT = '/studio/submit' as Href;
export const submitStep = (step: 'processing' | 'chapters' | 'preview' | 'done', rev: string) =>
  `/studio/submit/${step}?rev=${rev}` as Href;

const MB = 1024 * 1024;
export const SOURCE_LIMIT: Record<SourceType, number> = { docx: 50 * MB, epub: 50 * MB, pdf: 100 * MB };
export const COVER_LIMIT = 10 * MB;

const TYPES: Record<SourceType, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
};

export class SubmitError extends Error {}

export interface PickedFile {
  uri: string;
  name: string;
  size: number;
  type: string;
}

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token || !api) throw new SubmitError('Sign in again to continue.');
  return { Authorization: `Bearer ${token}` };
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${api}/v1/books${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(await authHeader()),
      ...(body === undefined ? null : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new SubmitError(plainError(json.error));
  return json;
}

/** Worker and RPC messages are for engineers; the author sees one plain line. */
function plainError(e: string | undefined) {
  if (!e) return 'Something went wrong. Try again.';
  if (/still open/.test(e)) return 'This book already has an upload in progress. Finish or replace it first.';
  if (/not an author/.test(e)) return 'Only approved authors can submit books.';
  if (/closed/.test(e)) return 'This book can’t be updated. See My books for why.';
  if (/^[A-Z]/.test(e) && !e.includes(':')) return e; // already written for people
  return 'Something went wrong. Try again.';
}

export async function pickManuscript(source: SourceType): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: TYPES[source], copyToCacheDirectory: true });
  if (res.canceled || !res.assets[0]) return null;
  const f = res.assets[0];
  const ext = f.name.toLowerCase().split('.').pop();
  if (ext !== source) {
    throw new SubmitError(
      source === 'docx'
        ? 'Pick a Word file (.docx).'
        : source === 'epub'
          ? 'Pick an EPUB file.'
          : 'Pick a PDF file.',
    );
  }
  const size = f.size ?? 0;
  if (size > SOURCE_LIMIT[source]) {
    throw new SubmitError(`This file is over ${SOURCE_LIMIT[source] / MB} MB. Try a smaller one.`);
  }
  return { uri: f.uri, name: f.name, size, type: TYPES[source] };
}

export async function pickCover(): Promise<PickedFile | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  const type = a.mimeType ?? 'image/jpeg';
  if (type !== 'image/jpeg' && type !== 'image/png') throw new SubmitError('Use a JPG or PNG image.');
  const size = a.fileSize ?? 0;
  if (size > COVER_LIMIT) throw new SubmitError('This image is over 10 MB. Try a smaller one.');
  return { uri: a.uri, name: a.fileName ?? 'cover.jpg', size, type, ...dims(a) };
}

const dims = (a: { width: number; height: number }) => ({ width: a.width, height: a.height });

/** "1600 × 2560 · 1.2 MB", with a nudge when the cover is landscape or small. */
export function coverLine(c: PickedFile & { width?: number; height?: number }, size: string) {
  if (!c.width || !c.height) return size;
  const note =
    c.width > c.height ? ' · portrait works best' : c.height < 1600 ? ' · bigger looks sharper' : '';
  return `${c.width} × ${c.height} · ${size}${note}`;
}

async function put(url: string, file: PickedFile) {
  const bytes = await (await fetch(file.uri)).arrayBuffer();
  const sha = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  const hex = [...new Uint8Array(sha)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...(await authHeader()), 'Content-Type': file.type, 'X-Content-SHA256': hex },
    body: bytes,
  });
  if (!res.ok) throw new SubmitError('Upload didn’t finish. Check your connection and try again.');
}

/**
 * Step 1 → 2: create the revision, upload manuscript and cover, finalize. EPUB goes straight to
 * the Worker's checks (it is already an ebook; the Worker rebuilds it from sanitised content).
 * Word and PDF go to the Arpedia team's desk until on-device Word conversion lands (rule 18a).
 */
export async function uploadBook(
  v: SubmitValues,
  file: PickedFile,
  cover: PickedFile,
  bookId?: string,
  replace?: boolean,
) {
  const ticket = await call<{
    book_id: string;
    revision_id: string;
    uploads: { source: string; cover: string; converted?: string };
  }>('/upload', {
    ...(bookId ? { book_id: bookId } : {}),
    meta: {
      source_type: v.source,
      title: v.title.trim(),
      ...(v.subtitle.trim() ? { subtitle: v.subtitle.trim() } : {}),
      description: v.description.trim(),
      genres: v.genres,
      // Continue on a draft whose upload never finished: the new upload closes that draft.
      ...(replace ? { replace: true } : {}),
    },
  });
  await put(ticket.uploads.source, file);
  await put(ticket.uploads.cover, cover);
  const converted = v.source === 'epub' && !!ticket.uploads.converted;
  if (converted) await put(ticket.uploads.converted!, { ...file, type: TYPES.epub });
  await call('/finalize', {
    revision_id: ticket.revision_id,
    converted,
    ...(converted ? {} : { reason: 'conversion_skipped' }),
  });
  return ticket.revision_id;
}

export interface RevisionStatus {
  revision_id: string;
  status: string;
  draft_step: 'upload' | 'converting' | 'checking' | 'chapters' | 'preview' | null;
  readiness: number | null;
  words: number | null;
  pages: number | null;
  price_credits: number | null;
  preview_percent: number | null;
  desk_reason: string | null;
  sent_back_note: string | null;
  chapters_confirmed: boolean;
  blocking: boolean;
  flags: {
    id: string;
    check_key: string;
    blocking: boolean;
    message: string;
    suggestion: string | null;
    location: { ord?: number } | null;
  }[];
}

const retry = (n: number, e: unknown) => n < 2 && isNetworkError(e);

/** Revision status; polls every 3 s while the Worker works, every 15 s while it's with the desk. */
export function useRevisionStatus(rev: string | undefined) {
  return useQuery({
    queryKey: ['revision-status', rev],
    enabled: !!rev,
    retry,
    queryFn: () => call<RevisionStatus>(`/status/${rev}`),
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d || d.status === 'processing' || (d.status === 'draft' && !isChaptersReady(d))) return 3000;
      return d.status === 'with_desk' || d.status === 'needs_fixes' ? 15_000 : false;
    },
  });
}

export const isChaptersReady = (d: Pick<RevisionStatus, 'status' | 'draft_step'>) =>
  d.status === 'draft' && (d.draft_step === 'chapters' || d.draft_step === 'preview');

export interface RevisionChapter {
  ord: number;
  kind: string;
  title: string;
  words: number;
}

export function useRevisionChapters(rev: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['revision-chapters', rev],
    enabled: !!rev && enabled,
    retry,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chapters')
        .select('ord, kind, title, words')
        .eq('revision_id', rev!)
        .order('ord');
      if (error) throw error;
      return data as RevisionChapter[];
    },
  });
}

export type ChapterEdit = { op: 'rename'; ord: number; title: string } | { op: 'merge_up'; ord: number };

export const confirmChapters = (rev: string, edits: ChapterEdit[]) =>
  call<{ words: number; pages: number; price_credits: number; readiness: number }>('/confirm', {
    revision_id: rev,
    edits,
  });

export const submitRevision = (rev: string) => call<{ status: string }>('/submit', { revision_id: rev });

/** The book a revision belongs to (title for the bands). */
export function useRevisionBook(rev: string | undefined) {
  return useQuery({
    queryKey: ['revision-book', rev],
    enabled: !!rev,
    retry,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('book_revisions')
        .select('id, source_type, submitted_at, revision_no, books ( id, title )')
        .eq('id', rev!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}
