// Flow 14 · copyright claims (docs/prd/14-trust-safety-support.md rules 29 and 30, spec check 14-21).
// Claims by email are opened by the Resend inbound route in trust.ts (ingest_claim_email). The cron
// here fills the "Matching passages" hint: which passages of the claimant's text (the email body and
// any plain-text evidence) are in the book's working copy. A hint for staff, never a verdict.
import { claimSimilarity, type ClaimChapter, type Json } from '@arpedia/core';
import { serviceDb } from '../../db';
import type { Env } from '../../env';
import { loadWork } from '../12/pipeline';

/** Plain-text evidence read for the check (bigger files are left for staff to open). */
const TEXT_MAX = 1024 * 1024;

export interface EvidenceFile {
  key: string;
  name: string;
  type: string;
  bytes: number;
}

const KINDS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/msword': 'Word',
  'text/plain': 'Text',
};

/** "3.8 MB", "640 KB" */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "text/plain; charset=utf-8" → "text/plain". */
export const mediaType = (type: unknown) =>
  typeof type === 'string' ? (type.split(';')[0] ?? '').trim().toLowerCase() : '';

/** An attachment as the claim's evidence list holds it (admin claim page: name, kind, size). */
export function evidenceOf(f: EvidenceFile) {
  const t = mediaType(f.type);
  const kind = KINDS[t] ?? (t.startsWith('image/') ? 'Image' : 'File');
  return { key: f.key, name: f.name, kind, size: sizeLabel(f.bytes), type: f.type };
}

/** An HTML-only email body as text: paragraphs and line breaks kept, tags and entities dropped. */
export function plainText(html: string): string {
  const named: Record<string, string> = {
    nbsp: ' ',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
    amp: '&',
    ldquo: '“',
    rdquo: '”',
    lsquo: '‘',
    rsquo: '’',
    mdash: '—',
    ndash: '–',
    hellip: '…',
  };
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|blockquote|h[1-6])>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] !== '#') return named[e.toLowerCase()] ?? m;
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n\n')
    .trim();
}

interface Row {
  id: string;
  details: string | null;
  evidence: Json;
  revision_id: string | null;
  work_version: number | null;
}

/** The claimant's text: the email body (or report details) and plain-text evidence files. */
export async function claimText(env: Env, row: Pick<Row, 'details' | 'evidence'>): Promise<string> {
  const parts = [row.details ?? ''];
  const files = Array.isArray(row.evidence) ? (row.evidence as { key?: unknown; type?: unknown }[]) : [];
  for (const f of files.slice(0, 10)) {
    if (typeof f.key !== 'string' || !f.key.startsWith('claims/') || mediaType(f.type) !== 'text/plain')
      continue;
    const o = await env.BOOKS.get(f.key);
    if (!o || o.size > TEXT_MAX) continue;
    parts.push(await o.text());
  }
  return parts.join('\n\n');
}

/** Cron: the passage check for open claims that have none yet. */
export async function checkClaimSimilarity(env: Env): Promise<{ checked: number }> {
  const db = serviceDb(env);
  const { data, error } = await db.rpc('claims_needing_similarity', { p_limit: 5 });
  if (error) throw error;
  let checked = 0;
  for (const row of (data ?? []) as Row[]) {
    try {
      const work =
        row.revision_id && row.work_version != null
          ? await loadWork(env, row.revision_id, row.work_version)
          : null;
      let result: Json;
      if (!work) {
        result = { failed: true, reason: 'no_text' };
      } else {
        const chapters: ClaimChapter[] = work.chapters.map((ch) => ({
          title: ch.title,
          paragraphs: ch.blocks.filter((b) => !b.sceneBreak && b.text).map((b) => b.text),
        }));
        result = claimSimilarity(await claimText(env, row), chapters) as unknown as Json;
      }
      const { error: we } = await db.rpc('set_claim_similarity', { p_claim: row.id, p_similarity: result });
      if (we) throw we;
      checked++;
    } catch (e) {
      // Recorded as failed, so one bad claim never blocks the queue; it is tried again in an hour.
      console.error('claim similarity failed', row.id, e);
      await db.rpc('set_claim_similarity', {
        p_claim: row.id,
        p_similarity: { failed: true, reason: 'error' },
      });
    }
  }
  return { checked };
}
