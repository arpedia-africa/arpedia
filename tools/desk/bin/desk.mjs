#!/usr/bin/env node
// `desk` on a staff computer: runs the TypeScript CLI through tsx (pnpm --filter @arpedia/desk desk …).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tsx = createRequire(import.meta.url).resolve('tsx/cli');
const res = spawnSync(process.execPath, [tsx, join(here, '../src/index.ts'), ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(res.status ?? 1);
