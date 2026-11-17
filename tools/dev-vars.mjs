#!/usr/bin/env node
// Write workers/*/.dev.vars from the running local Supabase stack (`pnpm dev:vars`).
// Local CLI keys only; staging and production secrets live in Cloudflare, never on disk.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = execSync('pnpm -s exec supabase status -o env', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const env = Object.fromEntries(
  out.split(/\r?\n/).map(l => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]),
);
if (!env.SERVICE_ROLE_KEY || !env.JWT_SECRET) {
  console.error('Local Supabase is not running. Start it with `pnpm db:start`.');
  process.exit(1);
}
writeFileSync(join(root, 'workers/api/.dev.vars'),
  `SUPABASE_SERVICE_ROLE_KEY=${env.SERVICE_ROLE_KEY}\nSUPABASE_JWT_SECRET=${env.JWT_SECRET}\n`);
writeFileSync(join(root, 'workers/chat/.dev.vars'), `SUPABASE_JWT_SECRET=${env.JWT_SECRET}\n`);
console.log('Wrote workers/api/.dev.vars and workers/chat/.dev.vars');
