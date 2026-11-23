#!/usr/bin/env node
// Flow 17 rule 8 (Q5: the free plan has no automatic backups) · nightly encrypted database backups.
//   node tools/launch/backup.mjs nightly --target production       dump, encrypt, upload, keep 30 days
//   node tools/launch/backup.mjs dump --out db.sql.gz.enc            dump and encrypt to a file
//   node tools/launch/backup.mjs restore --file db.sql.gz.enc --into <scratch db url> --yes-wipe
//   node tools/launch/backup.mjs restore --key db/2026-12-01T0200Z.sql.gz.enc --target production --into …
// A backup holds the rows of the `public` and `auth` schemas (data only). The schema, scheduled
// jobs and queues come from the migrations, so a restore goes into a database built from them
// (`supabase db push` on a new project, or `supabase db reset` locally): every table is emptied,
// the rows are loaded with triggers off, then each table's row count is checked against the dump.
// Not in a backup: queue messages in flight, the vault, and storage (unused).
// Env: SUPABASE_DB_URL (dump), BACKUP_KEY (base64, 32 bytes; kept by the owner outside GitHub too),
//      R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (nightly, restore --key).
// --docker <container>: run pg_dump and psql inside the local Supabase container (local drills).
import { spawn } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  closeSync,
  createReadStream,
  createWriteStream,
  openSync,
  readSync,
  statSync,
  writeFileSync,
  mkdtempSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { parseArgs, requireEnv, runIfMain } from './lib.mjs';
import { backupBucket, r2FromEnv } from './r2.mjs';

export const MAGIC = Buffer.from('ARPBK1');
export const KEEP_DAYS = 30;
const SCHEMAS = ['public', 'auth'];
// Rows the migrations own on the target (never restored over them).
const EXCLUDE = ['auth.schema_migrations'];

export function backupKey(b64) {
  const key = Buffer.from(b64 ?? '', 'base64');
  if (key.length !== 32) throw new Error('BACKUP_KEY must be 32 bytes, base64');
  return key;
}

/** AES-256-GCM stream: MAGIC, 12-byte IV, ciphertext, then the 16-byte tag. */
export function encryptStream(key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let started = false;
  return new Transform({
    transform(chunk, _enc, done) {
      if (!started) {
        this.push(Buffer.concat([MAGIC, iv]));
        started = true;
      }
      done(null, cipher.update(chunk));
    },
    flush(done) {
      if (!started) this.push(Buffer.concat([MAGIC, iv]));
      this.push(cipher.final());
      done(null, cipher.getAuthTag());
    },
  });
}

/** Decrypt a backup file to a readable stream (the tag is read from the end first). */
export function decryptFile(path, key) {
  const size = statSync(path).size;
  const head = Buffer.alloc(MAGIC.length + 12);
  const tag = Buffer.alloc(16);
  const fd = openSync(path, 'r');
  readSync(fd, head, 0, head.length, 0);
  readSync(fd, tag, 0, 16, size - 16);
  closeSync(fd);
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('not an Arpedia backup');
  const decipher = createDecipheriv('aes-256-gcm', key, head.subarray(MAGIC.length));
  decipher.setAuthTag(tag);
  return createReadStream(path, { start: head.length, end: size - 17 }).pipe(decipher);
}

/** Rows per table in a plain pg_dump: the lines of each COPY … FROM stdin block. */
export function copyCounts(sql) {
  const counts = {};
  let table = null;
  for (const line of sql.split('\n')) {
    if (table) {
      if (line === '\\.') table = null;
      else counts[table]++;
    } else {
      const m = /^COPY ("?[\w]+"?\."?[\w]+"?) /.exec(line);
      if (m) {
        table = m[1].replace(/"/g, '');
        counts[table] = 0;
      }
    }
  }
  return counts;
}

/** Spawn a Postgres client tool, locally or inside a container. */
function pgTool(tool, args, { docker, input } = {}) {
  const [cmd, argv] = docker ? ['docker', ['exec', '-i', docker, tool, ...args]] : [tool, args];
  const child = spawn(cmd, argv, { stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => (err += d));
  const done = new Promise((resolve, reject) =>
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${tool} exited ${code}: ${err.slice(-2000)}`)),
    ),
  );
  return { child, done, stderr: () => err };
}

const dumpArgs = (dbUrl) => [
  '--data-only',
  '--no-owner',
  '--no-privileges',
  ...SCHEMAS.flatMap((s) => ['--schema', s]),
  ...EXCLUDE.flatMap((t) => ['--exclude-table', t]),
  '--dbname',
  dbUrl,
];

/** pg_dump → gzip → encrypt → file. */
export async function dumpToFile({ dbUrl, key, out, docker }) {
  const p = pgTool('pg_dump', dumpArgs(dbUrl), { docker });
  await Promise.all([
    pipeline(p.child.stdout, createGzip({ level: 9 }), encryptStream(key), createWriteStream(out)),
    p.done,
  ]);
  return statSync(out).size;
}

/** A stream sink that keeps every chunk in `parts`. */
export const collect = (parts) =>
  new Writable({
    write(chunk, _enc, done) {
      parts.push(chunk);
      done();
    },
  });

async function decryptToText(file, key) {
  const parts = [];
  await pipeline(decryptFile(file, key), createGunzip(), collect(parts));
  return Buffer.concat(parts).toString('utf8');
}

async function psql(dbUrl, sql, { docker, input } = {}) {
  const p = pgTool(
    'psql',
    ['--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-qAt', '--dbname', dbUrl, ...(input ? [] : ['-c', sql])],
    {
      docker,
      input: Boolean(input),
    },
  );
  let out = '';
  p.child.stdout.on('data', (d) => (out += d));
  if (input) {
    p.child.stdin.end(input);
  }
  await p.done;
  return out;
}

/** Empty the target, load the dump with triggers off, and compare row counts. */
export async function restoreInto({ text, dbUrl, docker, log = console.log }) {
  const want = copyCounts(text);
  const tables = Object.keys(want);
  if (!tables.length) throw new Error('the backup has no tables');
  const quoted = (t) =>
    t
      .split('.')
      .map((p) => `"${p}"`)
      .join('.');
  // Every table in the two schemas, including any the dump has no rows for.
  const all = (
    await psql(
      dbUrl,
      `select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in (${SCHEMAS.map((s) => `'${s}'`).join(',')}) and c.relkind in ('r','p')
         and (n.nspname || '.' || c.relname) not in (${EXCLUDE.map((t) => `'${t}'`).join(',')})`,
      { docker },
    )
  )
    .split('\n')
    .filter(Boolean);
  const script =
    `set session_replication_role = replica;\n` +
    // No RESTART IDENTITY: auth's sequences belong to supabase_auth_admin; the dump's setval lines
    // put every sequence back where it was.
    `truncate ${all.map(quoted).join(', ')} cascade;\n` +
    text +
    `\nset session_replication_role = origin;\n`;
  log(`Loading ${tables.length} tables into the target…`);
  await psql(dbUrl, null, { docker, input: `begin;\n${script}\ncommit;\n` });

  const countSql = tables.map((t) => `select '${t}', count(*) from ${quoted(t)}`).join(' union all ');
  const have = Object.fromEntries(
    (await psql(dbUrl, countSql, { docker }))
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [t, n] = l.split('|');
        return [t, Number(n)];
      }),
  );
  const mismatches = tables
    .filter((t) => have[t] !== want[t])
    .map((t) => ({ table: t, dump: want[t], restored: have[t] }));
  const rows = tables.reduce((s, t) => s + want[t], 0);
  return { tables: tables.length, rows, mismatches };
}

/** Objects older than KEEP_DAYS (by their timestamped name), oldest first. */
export function expired(objects, now = Date.now()) {
  const cutoff = now - KEEP_DAYS * 86_400_000;
  return objects
    .filter((o) => o.lastModified.getTime() < cutoff)
    .sort((a, b) => a.lastModified - b.lastModified);
}

export const objectKey = (d = new Date()) =>
  `db/${d.toISOString().slice(0, 16).replace(/:/g, '')}Z.sql.gz.enc`;

async function main(argv) {
  const args = parseArgs(argv);
  const [cmd] = args._;
  const docker = typeof args.docker === 'string' ? args.docker : undefined;
  const key = backupKey(requireEnv(process.env, ['BACKUP_KEY']).BACKUP_KEY);
  const work = mkdtempSync(join(tmpdir(), 'arpedia-backup-'));

  if (cmd === 'dump' || cmd === 'nightly') {
    const dbUrl = args.db ?? requireEnv(process.env, ['SUPABASE_DB_URL']).SUPABASE_DB_URL;
    const out = typeof args.out === 'string' ? args.out : join(work, 'backup.sql.gz.enc');
    const size = await dumpToFile({ dbUrl, key, out, docker });
    console.log(`Encrypted dump: ${out} (${(size / 1048576).toFixed(1)} MB)`);
    if (cmd === 'dump') return 0;

    const target = args.target;
    if (!['staging', 'production'].includes(target))
      throw new Error('nightly needs --target staging|production');
    const r2 = r2FromEnv(
      requireEnv(process.env, ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']),
    );
    const bucket = backupBucket(target);
    const k = objectKey();
    await r2.put(bucket, k, createReadStream(out), size);
    console.log(`Uploaded ${bucket}/${k}`);
    const old = expired(await r2.list(bucket, 'db/'));
    for (const o of old) await r2.del(bucket, o.key);
    if (old.length) console.log(`Removed ${old.length} backups older than ${KEEP_DAYS} days`);
    return 0;
  }

  if (cmd === 'restore') {
    if (args['yes-wipe'] !== true)
      throw new Error('restore empties the target database first: add --yes-wipe');
    const into = args.into;
    if (typeof into !== 'string') throw new Error('restore needs --into <scratch database url>');
    if (process.env.SUPABASE_DB_URL && into === process.env.SUPABASE_DB_URL && args['into-live'] !== true) {
      throw new Error(
        '--into is the live database (SUPABASE_DB_URL). Restore into a scratch database, or add --into-live after an incident.',
      );
    }
    let file = args.file;
    if (typeof args.key === 'string') {
      const r2 = r2FromEnv(
        requireEnv(process.env, ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']),
      );
      file = join(work, 'download.sql.gz.enc');
      writeFileSync(file, await r2.get(backupBucket(args.target), args.key));
    }
    if (typeof file !== 'string') throw new Error('restore needs --file or --key');
    const text = await decryptToText(file, key);
    const res = await restoreInto({ text, dbUrl: into, docker });
    console.log(`Restored ${res.rows} rows in ${res.tables} tables.`);
    if (res.mismatches.length) {
      for (const m of res.mismatches)
        console.log(`MISMATCH ${m.table}: dump ${m.dump}, restored ${m.restored}`);
      return 1;
    }
    console.log('Row counts match the dump for every table.');
    return 0;
  }

  throw new Error('usage: backup.mjs nightly|dump|restore (see the top of this file)');
}

runIfMain(import.meta.url, main);
