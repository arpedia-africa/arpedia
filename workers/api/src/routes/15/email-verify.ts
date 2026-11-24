import { Hono } from 'hono';
import { serviceDb } from '../../db';
import type { AppEnv } from '../../env';

// Flow 15 · the link in the verify email (flow 01 rule 5).
//   GET  /v1/email-verify?t=<token>  a page with one Confirm button (mail scanners that open links
//                                    don't use the token up)
//   POST /v1/email-verify  t=<token>  confirm_email_verification → verified | expired | invalid
// Public: the token is the proof. Only its hash is stored, and it works once.

const verify = new Hono<AppEnv>();

const TOKEN = /^[0-9a-f]{48}$/;

function page(title: string, body: string, form = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title} · Arpedia</title>
<style>
:root{--bg:#faf7f2;--card:#fff;--ink:#1f1a14;--sub:#6b6258;--accent:#b4532a;--on:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#15120e;--card:#211c17;--ink:#f3ede5;--sub:#b3a99d;--accent:#e0794b;--on:#15120e}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);
font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:16px;box-sizing:border-box}
main{background:var(--card);border-radius:16px;padding:28px 24px;max-width:360px;width:100%;text-align:center}
h1{font-size:22px;margin:0 0 8px}p{color:var(--sub);margin:0 0 20px}
button{min-height:44px;width:100%;border:0;border-radius:12px;background:var(--accent);color:var(--on);
font:600 16px system-ui,sans-serif;cursor:pointer}
</style></head><body><main><h1>${title}</h1><p>${body}</p>${form}</main></body></html>`;
}

verify.get('/', (c) => {
  const t = c.req.query('t') ?? '';
  if (!TOKEN.test(t))
    return c.html(
      page('This link doesn’t work', 'Open the newest email we sent you, or sign in to the app.'),
      400,
    );
  return c.html(
    page(
      'Confirm your email',
      'Tap the button to confirm this is your email address for Arpedia.',
      `<form method="post"><input type="hidden" name="t" value="${t}"><button type="submit">Confirm my email</button></form>`,
    ),
  );
});

verify.post('/', async (c) => {
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const t = typeof form.t === 'string' ? form.t : '';
  if (!TOKEN.test(t))
    return c.html(
      page('This link doesn’t work', 'Open the newest email we sent you, or sign in to the app.'),
      400,
    );
  const { data, error } = await serviceDb(c.env).rpc('confirm_email_verification', { p_token: t });
  if (error) throw new Error(`confirm_email_verification failed: ${error.message}`);
  if (data === 'verified')
    return c.html(page('Your email is confirmed', 'Thank you. You can close this page and keep reading.'));
  if (data === 'expired')
    return c.html(
      page(
        'This link has expired',
        'Links work for 7 days. Your account works as normal, so there’s nothing else to do.',
      ),
      410,
    );
  return c.html(
    page('This link doesn’t work', 'It may have been used already. Your account works as normal.'),
    400,
  );
});

export default verify;
