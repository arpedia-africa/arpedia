import { Hono } from 'hono';
import { serviceDb } from '../../db';
import type { AppEnv, Env } from '../../env';

// Flow 16 rule 38: public copies of the policies at arpedia.africa/legal (the owner routes that path
// to this Worker, RUNBOOK §2). Only the latest published version is shown; drafts never leave the
// database. The Delete-account page must always be live (Google Play), so its steps are built in
// and stay on the page whatever its published text says.
const legal = new Hono<AppEnv>();

export interface PublicPolicy {
  slug: string;
  title: string;
  subtitle: string | null;
  always_live: boolean;
  version: number;
  published_at: string;
  body: string;
}

const TTL_MS = 5 * 60_000;
let cached: { at: number; value: PublicPolicy[] } | null = null;

/** The policies, or the last copy when the database doesn't answer (null if there is none). */
async function load(env: Env): Promise<PublicPolicy[] | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  try {
    const { data, error } = await serviceDb(env).rpc('get_public_policies', {});
    if (error) throw error;
    cached = { at: Date.now(), value: (data ?? []) as unknown as PublicPolicy[] };
    return cached.value;
  } catch (e) {
    console.error('[legal]', e);
    return cached?.value ?? null;
  }
}

/** Test seam: forget the cached policies. */
export function resetLegalCache() {
  cached = null;
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!,
  );

/** Links in already-escaped text: https URLs and email addresses. */
const linkify = (s: string) =>
  s
    .replace(/https:\/\/[^\s<]+[^\s<.,;:)]/g, (u) => `<a href="${u}">${u}</a>`)
    .replace(/\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g, (m) => `<a href="mailto:${m}">${m}</a>`);

/**
 * Policy text to HTML. Plain text as staff type it in the console: blank lines split paragraphs,
 * "# " and "## " start headings, "- " starts a list item. Everything is escaped first.
 */
export function renderBody(body: string): string {
  const out: string[] = [];
  for (const block of body.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    let para: string[] = [];
    let list: string[] = [];
    const flush = () => {
      if (para.length) out.push(`<p>${para.join('<br>')}</p>`);
      if (list.length) out.push(`<ul>${list.map((li) => `<li>${li}</li>`).join('')}</ul>`);
      para = [];
      list = [];
    };
    for (const raw of lines) {
      const line = linkify(esc(raw.trim()));
      const h = /^(#{1,2}) (.+)$/.exec(raw.trim());
      if (h) {
        flush();
        out.push(h[1] === '#' ? `<h2>${linkify(esc(h[2]!))}</h2>` : `<h3>${linkify(esc(h[2]!))}</h3>`);
      } else if (raw.trim().startsWith('- ')) {
        if (para.length) flush();
        list.push(line.slice(2));
      } else {
        if (list.length) flush();
        para.push(line);
      }
    }
    flush();
  }
  return out.join('\n');
}

const SUPPORT = 'support@arpedia.africa';

/** Always on the Delete-account page (Play: how to ask for deletion, in the app and without it). */
const DELETE_STEPS = `<section class="steps">
<h2>How to delete your Arpedia account</h2>
<h3>In the app</h3>
<ol>
<li>Open Arpedia and sign in.</li>
<li>Tap <b>Profile</b>, then <b>Delete account</b> at the bottom.</li>
<li>Read what will be removed, type the confirmation and tap <b>Delete account</b>.</li>
</ol>
<h3>Without the app</h3>
<p>Email <a href="mailto:${SUPPORT}?subject=Delete%20my%20account">${SUPPORT}</a> from the email address on your account, with the subject “Delete my account”. We reply to confirm it’s you, then delete the account.</p>
<p>What we remove and what the law asks us to keep is set out in our <a href="/legal/privacy">Privacy policy</a>.</p>
</section>`;

const CSS = `:root{--bg:#fff;--ink:#111827;--ink-2:#4B5563;--line:#E5E7EB;--link:#9A4F00;--panel:#FFF6EA}
@media (prefers-color-scheme:dark){:root{--bg:#14110D;--ink:#E8E0D4;--ink-2:#B8AE9F;--line:#3A3128;--link:#F5931F;--panel:#211A13}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 16px 64px}
header a{color:var(--ink);text-decoration:none;font-weight:800;font-size:20px;letter-spacing:-.02em}
h1{font-size:28px;line-height:1.2;letter-spacing:-.02em;margin:24px 0 4px}h2{font-size:20px;margin:28px 0 8px}h3{font-size:17px;margin:20px 0 4px}
.meta{color:var(--ink-2);font-size:14px;margin:0 0 24px}a{color:var(--link)}
ul,ol{padding-left:22px}li{margin:4px 0}
.steps{background:var(--panel);border-radius:14px;padding:4px 20px 12px;margin:0 0 24px}
nav ul{list-style:none;padding:0}nav li{border-bottom:1px solid var(--line);margin:0}
nav a{display:block;padding:14px 0;text-decoration:none;color:var(--ink);font-weight:600}nav small{display:block;color:var(--ink-2);font-weight:400}
footer{margin-top:48px;padding-top:16px;border-top:1px solid var(--line);color:var(--ink-2);font-size:14px}`;

function page(title: string, content: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Arpedia</title><style>${CSS}</style></head><body><main><header><a href="/legal">arpedia</a></header>${content}<footer><a href="/legal">All policies</a> · <a href="mailto:${SUPPORT}">${SUPPORT}</a></footer></main></body></html>`;
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  });

export function renderPolicy(p: PublicPolicy): string {
  const steps = p.slug === 'delete-account' ? DELETE_STEPS : '';
  return page(
    p.title,
    `<h1>${esc(p.title)}</h1><p class="meta">Version ${p.version} · ${day(p.published_at)}</p>${steps}${renderBody(p.body)}`,
  );
}

export function renderIndex(all: PublicPolicy[]): string {
  const rows = all
    .map(
      (p) =>
        `<li><a href="/legal/${esc(p.slug)}">${esc(p.title)}${p.subtitle ? `<small>${esc(p.subtitle)}</small>` : ''}</a></li>`,
    )
    .join('');
  return page('Policies', `<h1>Policies</h1><nav><ul>${rows}</ul></nav>`);
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    },
  });
}

const UNAVAILABLE = page(
  'Try again soon',
  `<h1>We can’t show this page right now</h1><p>Please try again in a few minutes, or email <a href="mailto:${SUPPORT}">${SUPPORT}</a>.</p>`,
);

legal.get('/', async (c) => {
  const all = await load(c.env);
  return all ? html(renderIndex(all)) : html(UNAVAILABLE, 503);
});

legal.get('/:slug', async (c) => {
  const slug = c.req.param('slug').toLowerCase();
  const all = await load(c.env);
  // The Delete-account steps never depend on the database.
  if (!all && slug === 'delete-account')
    return html(page('Delete your account', `<h1>Delete your account</h1>${DELETE_STEPS}`));
  if (!all) return html(UNAVAILABLE, 503);
  const p = all.find((x) => x.slug === slug);
  if (!p)
    return html(
      page(
        'Not found',
        `<h1>Page not found</h1><p>This policy doesn’t exist. See <a href="/legal">all policies</a>.</p>`,
      ),
      404,
    );
  return html(renderPolicy(p));
});

export default legal;
