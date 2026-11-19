#!/usr/bin/env node
// Write workers/*/.dev.vars from the running local Supabase stack (`pnpm dev:vars`).
// Local CLI keys only; staging and production secrets live in Cloudflare, never on disk.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = execSync('pnpm -s exec supabase status -o env', {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const env = Object.fromEntries(
  out
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (!env.SERVICE_ROLE_KEY || !env.JWT_SECRET) {
  console.error('Local Supabase is not running. Start it with `pnpm db:start`.');
  process.exit(1);
}
// ADMIN_PORT / API_PORT (default 3000 / 8787) let a second local stack run beside the first.
const adminPort = process.env.ADMIN_PORT ?? '3000';
const apiPort = process.env.API_PORT ?? '8787';
// Local-only book keys, derived from the local JWT secret so they stay the same across runs.
const derive = (label) =>
  createHash('sha256').update(`arpedia-local:${label}:${env.JWT_SECRET}`).digest('base64');
writeFileSync(
  join(root, 'workers/api/.dev.vars'),
  `SUPABASE_URL=${env.API_URL}\nSUPABASE_SERVICE_ROLE_KEY=${env.SERVICE_ROLE_KEY}\nSUPABASE_JWT_SECRET=${env.JWT_SECRET}\n` +
    `SUPABASE_ANON_KEY=${env.ANON_KEY}\nBOOK_MASTER_KEY=${derive('book-master')}\nUPLOAD_SIGNING_KEY=${derive('upload')}\n` +
    `ADMIN_URL=http://127.0.0.1:${adminPort}\n`,
);
writeFileSync(join(root, 'workers/chat/.dev.vars'), `SUPABASE_JWT_SECRET=${env.JWT_SECRET}\n`);
writeFileSync(
  join(root, 'apps/admin/.env.local'),
  `NEXT_PUBLIC_SUPABASE_URL=${env.API_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${env.ANON_KEY}\nNEXT_PUBLIC_APP_ENV=local\n` +
    `ARPEDIA_API_URL=http://127.0.0.1:${apiPort}\n`,
);
// The Android emulator reaches the host at 10.0.2.2. A real phone (--phone) uses 127.0.0.1
// through `adb reverse tcp:<port> tcp:<port>` for the Supabase API and api Worker ports.
const host = process.argv.includes('--phone') ? '127.0.0.1' : '10.0.2.2';
writeFileSync(
  join(root, 'apps/mobile/.env.local'),
  `EXPO_PUBLIC_SUPABASE_URL=${env.API_URL.replace('127.0.0.1', host)}\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${env.ANON_KEY}\nEXPO_PUBLIC_API_URL=http://${host}:${apiPort}\n`,
);
console.log('Wrote workers/*/.dev.vars, apps/admin/.env.local and apps/mobile/.env.local');
