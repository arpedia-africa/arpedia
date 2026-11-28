// Plagiarism and content-policy checks (docs/prd/12-book-pipeline.md rules 24 and 25, spec check
// 12-3). Each check calls a provider adapter with a 20 s timeout. On timeout or a provider error
// the check is recorded `skipped`, does not block, and Operations admin is alerted. A check with no
// provider set up is recorded `skipped` (`not_configured`) without an alert.
//
// Providers are open questions 39 (plagiarism) and 52 (content policy; default: an adapter over a
// moderation model, hits block). The content-policy adapter speaks the moderation-model API
// (`POST {input: string[]}` → `{results: [{flagged, categories, category_scores}]}`) and is on when
// MODERATION_API_KEY is set. No plagiarism provider is chosen yet, so that check always skips.
import type { VerifyFlag, WorkChapter } from '@arpedia/convert';

export const SCREEN_TIMEOUT_MS = 20_000;
export const MODERATION_URL = 'https://api.openai.com/v1/moderations';
export const MODERATION_MODEL = 'omni-moderation-latest';
/** Characters per moderation input, and at most this many inputs per book (spread over the book). */
const CHUNK = 6_000;
const MAX_CHUNKS = 32;

export type CheckName = 'plagiarism' | 'policy';
export type CheckResult =
  { status: 'ok' } | { status: 'skipped'; reason: 'not_configured' | 'timeout' | 'provider_error' };

export interface Screening {
  flags: VerifyFlag[];
  checks: Record<CheckName, CheckResult>;
}

export interface ScreenEnv {
  MODERATION_API_KEY?: string;
  MODERATION_API_URL?: string;
}

interface Chunk {
  ord: number;
  text: string;
}

/** The book's own text in pieces, chapter by chapter (front matter left out), spread evenly. */
export function chunks(chapters: WorkChapter[]): Chunk[] {
  const all: Chunk[] = [];
  chapters.forEach((c, ord) => {
    if (c.front) return;
    let buf = '';
    for (const b of c.blocks) {
      const t = b.text.trim();
      if (!t) continue;
      if (buf && buf.length + t.length + 1 > CHUNK) {
        all.push({ ord, text: buf });
        buf = '';
      }
      buf = buf ? `${buf}\n${t}` : t;
      while (buf.length > CHUNK) {
        all.push({ ord, text: buf.slice(0, CHUNK) });
        buf = buf.slice(CHUNK);
      }
    }
    if (buf) all.push({ ord, text: buf });
  });
  if (all.length <= MAX_CHUNKS) return all;
  const step = all.length / MAX_CHUNKS;
  return Array.from({ length: MAX_CHUNKS }, (_, i) => all[Math.floor(i * step)]!);
}

/** Categories that block publishing at once; any other flagged category is borderline. */
const HIT: Record<string, number> = {
  'sexual/minors': 0.5,
  'self-harm/instructions': 0.9,
  'illicit/violent': 0.9,
  'hate/threatening': 0.9,
};
const LABEL: Record<string, string> = {
  'sexual/minors': 'sexual content involving minors',
  'self-harm/instructions': 'instructions for self-harm',
  'illicit/violent': 'instructions for violent crime',
  'hate/threatening': 'threatening hate speech',
  sexual: 'sexual content',
  harassment: 'harassment',
  'harassment/threatening': 'threats',
  hate: 'hate speech',
  illicit: 'instructions for crime',
  'self-harm': 'self-harm',
  'self-harm/intent': 'self-harm',
  violence: 'violence',
  'violence/graphic': 'graphic violence',
};

interface ModerationResult {
  flagged?: boolean;
  categories?: Record<string, boolean>;
  category_scores?: Record<string, number>;
}

class ProviderError extends Error {}

async function post(url: string, key: string, body: unknown, fetcher: typeof fetch, ms: number) {
  let res: Response;
  try {
    res = await fetcher(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    });
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw e;
    throw new ProviderError(String(e));
  }
  if (!res.ok) throw new ProviderError(`HTTP ${res.status}`);
  return (await res.json().catch(() => null)) as unknown;
}

/** Content policy over a moderation model: one blocking flag and one borderline flag at most. */
async function policy(
  env: ScreenEnv,
  parts: Chunk[],
  fetcher: typeof fetch,
  ms: number,
): Promise<VerifyFlag[]> {
  if (!parts.length) return [];
  const data = (await post(
    env.MODERATION_API_URL || MODERATION_URL,
    env.MODERATION_API_KEY!,
    { model: MODERATION_MODEL, input: parts.map((p) => p.text) },
    fetcher,
    ms,
  )) as { results?: ModerationResult[] } | null;
  const results = data?.results;
  if (!Array.isArray(results) || results.length !== parts.length) throw new ProviderError('bad response');

  const hits = new Map<string, number[]>();
  const borderline = new Map<string, number[]>();
  results.forEach((r, i) => {
    const ord = parts[i]!.ord;
    for (const [cat, on] of Object.entries(r.categories ?? {})) {
      if (!on) continue;
      const score = r.category_scores?.[cat] ?? 1;
      const into = cat in HIT && score >= HIT[cat]! ? hits : borderline;
      into.set(cat, [...new Set([...(into.get(cat) ?? []), ord])]);
    }
  });
  for (const cat of hits.keys()) borderline.delete(cat);

  const flag = (key: 'policy_hit' | 'policy_borderline', found: Map<string, number[]>): VerifyFlag | null => {
    if (!found.size) return null;
    const ords = [...new Set([...found.values()].flat())].sort((a, b) => a - b);
    const what = [...new Set([...found.keys()].map((c) => LABEL[c] ?? c.replace(/[/_-]/g, ' ')))];
    const where = ords.length === 1 ? 'in one chapter' : `in ${ords.length} chapters`;
    return {
      check_key: key,
      message:
        key === 'policy_hit'
          ? `The content check found possible ${what.join(', ')} ${where}. A Publisher must look before this book can go live.`
          : `The content check found possible ${what.join(', ')} ${where}. Check that the content notes say so.`,
      suggestion:
        key === 'policy_hit'
          ? 'Read the chapter and reject the book if it breaks the content rules.'
          : undefined,
      location: { chapter_ord: ords[0] },
    };
  };
  return [flag('policy_hit', hits), flag('policy_borderline', borderline)].filter(
    (f): f is VerifyFlag => !!f,
  );
}

const failure = (e: unknown): CheckResult =>
  e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')
    ? { status: 'skipped', reason: 'timeout' }
    : { status: 'skipped', reason: 'provider_error' };

/** Runs both checks side by side; never throws (a failed check is skipped, not a failed verify). */
export async function screenBook(
  env: ScreenEnv,
  chapters: WorkChapter[],
  opts: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<Screening> {
  const fetcher = opts.fetcher ?? fetch;
  const ms = opts.timeoutMs ?? SCREEN_TIMEOUT_MS;
  const flags: VerifyFlag[] = [];
  let pol: CheckResult = { status: 'skipped', reason: 'not_configured' };
  if (env.MODERATION_API_KEY) {
    try {
      flags.push(...(await policy(env, chunks(chapters), fetcher, ms)));
      pol = { status: 'ok' };
    } catch (e) {
      console.error('content policy check skipped', e);
      pol = failure(e);
    }
  }
  // No plagiarism provider is chosen yet (open question 39): skipped, never blocking.
  return { flags, checks: { plagiarism: { status: 'skipped', reason: 'not_configured' }, policy: pol } };
}
