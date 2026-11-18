#!/usr/bin/env node
// Staff desk CLI (docs/prd/12-book-pipeline.md rules 20–23). Runs on a staff computer with pandoc,
// poppler (pdftotext) and epubcheck installed:
//   desk login [--email you@arpedia.africa] [--code 123456]   sign in as Operations admin or Publisher
//   desk pull [--revision <id>] [--push]   claim the oldest job, download, convert, run epubcheck
//   desk push [<revision id>]              upload the converted package; verify takes it from there
//   desk heartbeat <revision id>           keep a claimed job's lease (pull and push do this themselves)
//   desk logout
// A scanned, corrupt or password-protected file goes back to the author automatically. Jobs are kept
// in ~/.arpedia-desk/jobs/<revision id>/ (source, converted.epub, epubcheck.json, job.json).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { call, DeskError, download, endpoints, HOME, login, put, session, type Session } from './api';
import { convertJob, ToolMissing, type SourceType } from './convert';
import type { DeskFlag } from './report';

interface Job {
  revision_id: string;
  book_id: string;
  title: string;
  source_type: SourceType;
  desk_reason: string | null;
  lease_until: string;
}
interface JobFile {
  job: Job;
  flags: DeskFlag[];
  pushed_at?: string;
}

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');
const JOBS = join(HOME, 'jobs');
const HEARTBEAT_MS = 60_000;
const say = (s: string) => process.stdout.write(s + '\n');

async function ask(question: string, hidden = false): Promise<string> {
  if (!hidden || !process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(question);
    rl.close();
    return answer;
  }
  process.stdout.write(question);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let value = '';
  return new Promise((done) => {
    const onData = (buf: Buffer) => {
      for (const ch of buf.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off('data', onData);
          process.stdout.write('\n');
          return done(value);
        }
        if (ch === '\u0003') process.exit(130);
        value = ch === '\u007f' || ch === '\b' ? value.slice(0, -1) : value + ch;
      }
    };
    process.stdin.on('data', onData);
  });
}

/** Keep the lease while work runs; a lost lease stops the job. */
function keepLease(s: Session, rev: string) {
  let lost: Error | null = null;
  const timer = setInterval(() => {
    call(s, '/desk/heartbeat', { revision_id: rev }).catch((e: Error) => {
      lost = e;
    });
  }, HEARTBEAT_MS);
  return {
    stop: () => clearInterval(timer),
    check: () => {
      if (lost) throw new DeskError(`The job's lease was lost (${lost.message}). Run desk pull again.`);
    },
  };
}

const jobDir = (rev: string) => join(JOBS, rev);
const readJob = (rev: string) => JSON.parse(readFileSync(join(jobDir(rev), 'job.json'), 'utf8')) as JobFile;

async function rejectUnreadable(s: Session, job: Job, detail: string) {
  const res = await fetch(`${s.supabaseUrl}/rest/v1/rpc/desk_reject_unreadable`, {
    method: 'POST',
    headers: {
      apikey: s.anonKey,
      Authorization: `Bearer ${s.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_rev: job.revision_id, p_reason: detail.slice(0, 500) }),
  });
  if (!res.ok) throw new DeskError(`Could not send it back: ${await res.text()}`, res.status);
}

async function push(s: Session, rev: string) {
  const file = readJob(rev);
  if (file.pushed_at) throw new DeskError(`${file.job.title} was already pushed at ${file.pushed_at}.`);
  await call(s, '/desk/heartbeat', { revision_id: rev });
  const epub = new Uint8Array(readFileSync(join(jobDir(rev), 'converted.epub')));
  const link = await call<{ url: string }>(s, '/desk/upload', { revision_id: rev });
  await put(link.url, epub);
  const res = await call<{ status: string }>(s, '/finalize', {
    revision_id: rev,
    converted: true,
    ...(file.flags.length ? { flags: file.flags } : {}),
  });
  writeFileSync(
    join(jobDir(rev), 'job.json'),
    JSON.stringify({ ...file, pushed_at: new Date().toISOString() }, null, 2),
  );
  say(
    `Pushed ${file.job.title} (${res.status}). The author is asked to confirm chapters once checks finish.`,
  );
}

async function pull(s: Session, opts: { revision?: string; push?: boolean }) {
  const { job } = await call<{ job: Job | null }>(
    s,
    '/desk/claim',
    opts.revision ? { revision_id: opts.revision } : {},
  );
  if (!job) return say(opts.revision ? 'That job is not waiting for the desk.' : 'No desk jobs waiting.');
  say(
    `Claimed ${job.title} (${job.source_type}, ${job.desk_reason ?? 'desk'}), lease until ${job.lease_until}.`,
  );
  const dir = jobDir(job.revision_id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const lease = keepLease(s, job.revision_id);
  try {
    const src = await call<{ url: string }>(s, '/desk/source', { revision_id: job.revision_id });
    const source = `source.${job.source_type}`;
    writeFileSync(join(dir, source), await download(src.url));
    const res = await convertJob(dir, source, job.source_type, {
      revisionId: job.revision_id,
      title: job.title,
    });
    lease.check();
    if (!res.ok) {
      await rejectUnreadable(s, job, `${res.reason}: ${res.detail}`);
      return say(`Sent back automatically: ${job.title} could not be read (${res.reason}: ${res.detail}).`);
    }
    writeFileSync(
      join(dir, 'job.json'),
      JSON.stringify({ job, flags: res.flags } satisfies JobFile, null, 2),
    );
    say(
      `Converted ${job.title}: ${res.chapters} headings, ${res.flags.length} epubcheck error(s).\n` +
        `  Package: ${res.epubPath}\n  Report:  ${res.reportPath}`,
    );
    if (opts.push) await push(s, job.revision_id);
    else say(`Check it, then run: desk push ${job.revision_id}`);
  } finally {
    lease.stop();
  }
}

/** The one converted job not pushed yet, when `desk push` is run without an id. */
function pendingJob(): string {
  const pending = existsSync(JOBS)
    ? readdirSync(JOBS).filter((rev) => existsSync(join(jobDir(rev), 'job.json')) && !readJob(rev).pushed_at)
    : [];
  if (pending.length === 1) return pending[0]!;
  throw new DeskError(
    pending.length ? `Say which job: ${pending.join(', ')}` : 'Nothing to push. Run desk pull first.',
  );
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      email: { type: 'string' },
      code: { type: 'string' },
      revision: { type: 'string' },
      push: { type: 'boolean' },
      'supabase-url': { type: 'string' },
      'anon-key': { type: 'string' },
      'api-url': { type: 'string' },
    },
  });
  const [cmd, arg] = positionals;
  switch (cmd) {
    case 'login': {
      const e = endpoints(
        { supabaseUrl: values['supabase-url'], anonKey: values['anon-key'], apiUrl: values['api-url'] },
        ROOT,
      );
      const email = values.email ?? (await ask('Email: '));
      const password = process.env.ARPEDIA_DESK_PASSWORD ?? (await ask('Password: ', true));
      const s = await login(e, email, password, async () => values.code ?? ask('Two-step code: '));
      return say(`Signed in as ${s.email}.`);
    }
    case 'logout':
      rmSync(join(HOME, 'session.json'), { force: true });
      return say('Signed out.');
    case 'pull':
      return pull(await session(), { revision: values.revision, push: values.push });
    case 'push':
      return push(await session(), arg ?? pendingJob());
    case 'heartbeat': {
      if (!arg) throw new DeskError('Usage: desk heartbeat <revision id>');
      const r = await call<{ lease_until: string }>(await session(), '/desk/heartbeat', { revision_id: arg });
      return say(`Lease until ${r.lease_until}.`);
    }
    default:
      say('Usage: desk login | pull [--revision <id>] [--push] | push [<id>] | heartbeat <id> | logout');
      process.exitCode = cmd ? 1 : 0;
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof DeskError || e instanceof ToolMissing ? e.message : String(e)}\n`);
  process.exit(1);
});
