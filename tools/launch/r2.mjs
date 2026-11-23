// Minimal R2 client over its S3 API (AWS Signature V4), so the backup job and preflight need no SDK.
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (an R2 API token scoped to the backup bucket)
// Local tests point `endpoint` at a stand-in.
import { createHash, createHmac } from 'node:crypto';

const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
const hex = (data) => createHash('sha256').update(data).digest('hex');
const enc = (s) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function r2Client({ accountId, accessKeyId, secretAccessKey, endpoint, fetchImpl = fetch }) {
  const base = (endpoint ?? `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/$/, '');
  const host = new URL(base).host;

  async function send(method, bucket, key = '', { query = {}, body, headers = {} } = {}) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, '');
    const day = amzDate.slice(0, 8);
    const path = `/${bucket}${key ? `/${key.split('/').map(enc).join('/')}` : ''}`;
    const qs = Object.keys(query)
      .sort()
      .map((k) => `${enc(k)}=${enc(String(query[k]))}`)
      .join('&');
    const h = { host, 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', 'x-amz-date': amzDate, ...headers };
    const names = Object.keys(h)
      .map((k) => k.toLowerCase())
      .sort();
    const lower = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
    const canonical = [
      method,
      path,
      qs,
      names.map((n) => `${n}:${lower[n]}\n`).join(''),
      names.join(';'),
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const scope = `${day}/auto/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, hex(canonical)].join('\n');
    const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), 'auto'), 's3'), 'aws4_request');
    const signature = createHmac('sha256', kSigning).update(toSign).digest('hex');
    const auth = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
    const res = await fetchImpl(`${base}${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers: { ...h, Authorization: auth },
      body,
      duplex: body ? 'half' : undefined,
    });
    if (!res.ok && !(method === 'GET' && res.status === 404 && !key)) {
      throw new Error(`R2 ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    return res;
  }

  return {
    put: (bucket, key, body, contentLength) =>
      send('PUT', bucket, key, {
        body,
        headers: { 'content-length': contentLength, 'content-type': 'application/octet-stream' },
      }),
    get: async (bucket, key) => Buffer.from(await (await send('GET', bucket, key)).arrayBuffer()),
    del: (bucket, key) => send('DELETE', bucket, key),
    /** Every object under `prefix`: [{ key, size, lastModified: Date }]. */
    async list(bucket, prefix = '') {
      const out = [];
      let token;
      do {
        const query = { 'list-type': 2, prefix, ...(token ? { 'continuation-token': token } : {}) };
        const xml = await (await send('GET', bucket, '', { query })).text();
        for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const tag = (t) => m[1].match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1];
          out.push({
            key: tag('Key'),
            size: Number(tag('Size')),
            lastModified: new Date(tag('LastModified')),
          });
        }
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
          ? xml.match(/<NextContinuationToken>([^<]*)</)?.[1]
          : null;
      } while (token);
      return out;
    },
  };
}

export const r2FromEnv = (env, fetchImpl) =>
  r2Client({
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    endpoint: env.R2_ENDPOINT,
    fetchImpl,
  });

/** The backup bucket for a target (production: arpedia-backups). */
export const backupBucket = (target) =>
  target === 'production' ? 'arpedia-backups' : `arpedia-backups-${target}`;
