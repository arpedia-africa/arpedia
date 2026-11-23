import { Hono } from 'hono';
import { requireUser } from '../../auth';
import { serviceDb } from '../../db';
import type { AppEnv } from '../../env';
import { sendTemplateEmail } from '../15/email';

// Reader self-export (flow 10 `export_reader_data`, Q4 default: from Settings, emailed). Found missing by
// the flow 17 account journey.
//   POST /v1/data-export           reader → {ok, email}; builds the JSON, stores it in R2 and emails
//                                  `data_export_ready` with a link. 429 {error: 'too_soon'} within a day.
//   GET  /v1/data-export/:token    the file, for 7 days (the token is the unguessable link from the email)

const DAY = 86_400_000;
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fileKey = (token: string) => `exports/reader/${token}/arpedia-data.json`;

const dataExport = new Hono<AppEnv>();

dataExport.post('/', requireUser, async (c) => {
  const user = c.get('user');
  const db = serviceDb(c.env);
  const { count } = await db
    .from('email_sends')
    .select('id', { count: 'exact', head: true })
    .eq('template_key', 'data_export_ready')
    .eq('user_id', user.sub!)
    .gte('sent_at', new Date(Date.now() - DAY).toISOString());
  if (count) return c.json({ error: 'too_soon' }, 429);

  const { data, error } = await db.rpc('export_reader_data', { p_user_id: user.sub! });
  if (error) throw new Error(`export_reader_data: ${error.message}`);
  const out = data as { account: { email: string }; profile?: { first_name?: string | null } | null };
  const token = crypto.randomUUID();
  await c.env.BOOKS.put(fileKey(token), JSON.stringify(data, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  });
  const link = `${new URL(c.req.url).origin}/v1/data-export/${token}`;
  await sendTemplateEmail(
    c.env,
    db,
    'data_export_ready',
    out.account.email,
    { first_name: out.profile?.first_name ?? '', link },
    user.sub!,
  );
  return c.json({ ok: true, email: out.account.email });
});

dataExport.get('/:token', async (c) => {
  const token = c.req.param('token');
  if (!TOKEN.test(token)) return c.json({ error: 'not_found' }, 404);
  const obj = await c.env.BOOKS.get(fileKey(token));
  if (!obj) return c.json({ error: 'not_found' }, 404);
  if (Date.now() - obj.uploaded.getTime() > 7 * DAY) {
    await c.env.BOOKS.delete(fileKey(token));
    return c.json({ error: 'expired' }, 410);
  }
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="arpedia-data.json"',
      'Cache-Control': 'no-store',
    },
  });
});

export default dataExport;
