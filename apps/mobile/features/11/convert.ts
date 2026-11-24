import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { Directory, File, Paths } from 'expo-file-system';
import { convertForUpload, type ConvertHints, type ConvertStage } from '@arpedia/convert';
import {
  finalizeRevision,
  putBytes,
  uploadBook,
  type ConvertSkipReason,
  type PickedFile,
  type UploadTicket,
} from './submit';
import type { SubmitValues } from './SubmitViews';

// On-device conversion for step 2 (flow 11 rules 18 and 23, flow 12 rules 6–8). Step 1 saves a job
// with its own copies of the manuscript and cover before it leaves, so a closed app picks up from
// the saved file. The signed upload link lasts 15 minutes; a job resumed later uploads again as a
// replacement of its draft and carries on under the new revision.

export interface ConvertJob {
  rev: string;
  bookId: string;
  source: 'docx' | 'epub';
  values: SubmitValues;
  file: PickedFile;
  cover: PickedFile;
  convertedUrl: string;
  /** ms since epoch when the signed links stop working. */
  expiresAt: number;
}

export type ConvertOutcome =
  | { rev: string; converted: true; hints: ConvertHints; ms: number }
  | { rev: string; converted: false; reason: ConvertSkipReason };

/** The converter's stages, then 'upload' while the clean EPUB goes up. */
export type JobStage = ConvertStage | 'upload';

const key = (rev: string) => `convert-job:${rev}`;
const dir = (rev: string) => new Directory(Paths.document, 'convert', rev);
/** Margin so an upload never starts on a link about to lapse. */
const LINK_MARGIN_MS = 2 * 60_000;

/** Copy the picked files somewhere the picker's cache can't clear, then save the job. */
async function saveJob(t: UploadTicket, values: SubmitValues, file: PickedFile, cover: PickedFile) {
  const d = dir(t.revision_id);
  d.create({ intermediates: true, idempotent: true });
  const keep = async (f: PickedFile, name: string) => {
    const to = new File(d, name);
    if (to.uri !== f.uri) {
      if (to.exists) to.delete();
      await new File(f.uri).copy(to);
    }
    return { ...f, uri: to.uri };
  };
  const job: ConvertJob = {
    rev: t.revision_id,
    bookId: t.book_id,
    source: values.source as 'docx' | 'epub',
    values,
    file: await keep(file, `source.${values.source}`),
    cover: await keep(cover, 'cover'),
    convertedUrl: t.uploads.converted!,
    expiresAt: Date.parse(t.expires_at),
  };
  await AsyncStorage.setItem(key(job.rev), JSON.stringify(job));
}

/** Step 1: upload the original and cover; Word and EPUB leave a conversion job for step 2. */
export const startUpload = (
  values: SubmitValues,
  file: PickedFile,
  cover: PickedFile,
  bookId?: string,
  replace?: boolean,
) => uploadBook(values, file, cover, bookId, replace, (t) => saveJob(t, values, file, cover));

export async function loadJob(rev: string): Promise<ConvertJob | null> {
  try {
    const raw = await AsyncStorage.getItem(key(rev));
    return raw ? (JSON.parse(raw) as ConvertJob) : null;
  } catch {
    return null;
  }
}

async function clearJob(rev: string) {
  await AsyncStorage.removeItem(key(rev));
  try {
    const d = dir(rev);
    if (d.exists) d.delete();
  } catch {
    // a leftover copy is harmless; the next job for this revision overwrites it
  }
}

/** One run per revision at a time, even if the screen remounts. */
const running = new Map<string, Promise<ConvertOutcome>>();

/**
 * Convert, upload the clean EPUB and finalize. A conversion that fails or runs out of memory, or a
 * book over 300,000 words, finalizes without it and goes to the desk (rule 7). Upload and network
 * errors throw (SubmitError) and keep the job for a retry.
 */
export function runJob(job: ConvertJob, onStage: (s: JobStage) => void): Promise<ConvertOutcome> {
  const live = running.get(job.rev);
  if (live) return live;
  const p = run(job, onStage).finally(() => running.delete(job.rev));
  running.set(job.rev, p);
  return p;
}

async function run(job: ConvertJob, onStage: (s: JobStage) => void): Promise<ConvertOutcome> {
  if (Date.now() > job.expiresAt - LINK_MARGIN_MS) {
    // The links lapsed while the app was closed: upload again as a replacement of this draft.
    const rev = await startUpload(job.values, job.file, job.cover, job.bookId, true);
    await clearJob(job.rev);
    const next = await loadJob(rev);
    if (!next) throw new Error('conversion job missing after re-upload');
    return run(next, onStage);
  }
  const started = Date.now();
  const bytes = new Uint8Array(await new File(job.file.uri).arrayBuffer());
  const res = await convertForUpload(
    bytes,
    job.source,
    { title: job.values.title.trim(), identifier: `urn:uuid:${job.rev}` },
    onStage,
  );
  if (res.ok) {
    onStage('upload');
    const epub = res.epub.buffer.slice(res.epub.byteOffset, res.epub.byteOffset + res.epub.byteLength);
    await putBytes(job.convertedUrl, epub as ArrayBuffer, 'application/epub+zip');
    await finalizeRevision(job.rev, true);
    await clearJob(job.rev);
    return { rev: job.rev, converted: true, hints: res.hints, ms: Date.now() - started };
  }
  await finalizeRevision(job.rev, false, res.reason);
  await clearJob(job.rev);
  return { rev: job.rev, converted: false, reason: res.reason };
}

export const deviceRamMb = () => (Device.totalMemory ? Math.round(Device.totalMemory / 1024 / 1024) : 0);
