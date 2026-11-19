#!/usr/bin/env node
// Second local Supabase stack for builders that don't use the phone, so database work never
// waits on the phone builder (who keeps the main stack, ports 553xx, for Maestro and the owner preview).
// Mirrors supabase/ into .db2/supabase with project_id "arpedia-b" and ports 556xx (no Studio).
//   node tools/db2.mjs start | reset | test | types | vars | status | stop
//   reset/test/types always re-sync migrations, seeds and tests from supabase/ first.
// `vars` writes .dev.vars/.env.local for this stack with Workers on 8797 (api) / 8798 (chat), admin on 3010.
// Lock: ~/projects/arpedia-locks/db2.lock (same rules as db.lock).
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'supabase');
const work = join(root, '.db2');
const dst = join(work, 'supabase');

function sync() {
  mkdirSync(dst, { recursive: true });
  for (const d of ['migrations', 'seeds', 'tests']) {
    rmSync(join(dst, d), { recursive: true, force: true });
    if (existsSync(join(src, d))) cpSync(join(src, d), join(dst, d), { recursive: true });
  }
  if (existsSync(join(src, 'seed.sql'))) cpSync(join(src, 'seed.sql'), join(dst, 'seed.sql'));
  let cfg = readFileSync(join(src, 'config.toml'), 'utf8')
    .replace(/^project_id = ".*"$/m, 'project_id = "arpedia-b"')
    .replace(/= 553(\d\d)\b/g, '= 556$1')
    .replace(/(\[studio\]\s*\nenabled = )true/, '$1false');
  writeFileSync(join(dst, 'config.toml'), cfg);
}

const sb = (args, opts = {}) =>
  execSync(`pnpm -s exec supabase ${args} --workdir "${work}"`, { cwd: root, stdio: 'inherit', ...opts });

const cmd = process.argv[2];
switch (cmd) {
  case 'start':
    sync();
    sb('start');
    break;
  case 'reset':
    sync();
    sb('db reset');
    break;
  case 'test':
    sync();
    sb('test db');
    break;
  case 'types': {
    sync();
    const out = execSync(`pnpm -s exec supabase gen types typescript --local --workdir "${work}"`, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 << 20,
    });
    writeFileSync(join(root, 'packages/core/src/database.types.ts'), out);
    console.log('Wrote packages/core/src/database.types.ts from the second stack');
    break;
  }
  case 'vars':
    execSync('node tools/dev-vars.mjs', {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, SUPABASE_WORKDIR: work, API_PORT: '8797', CHAT_PORT: '8798', ADMIN_PORT: '3010' },
    });
    break;
  case 'status':
    sb('status');
    break;
  case 'stop':
    sb('stop');
    break;
  default:
    console.error('usage: node tools/db2.mjs start|reset|test|types|vars|status|stop');
    process.exit(1);
}
