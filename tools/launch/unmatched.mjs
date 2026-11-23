#!/usr/bin/env node
// Flow 17 · store events for products the new app doesn't sell (v25), as CSV for Finance.
//   node tools/launch/unmatched.mjs --target production [--all] [--out unmatched.csv]
// Default: open events only. Finance marks one handled in SQL with
// resolve_unmatched_store_event(id, note) (Finance or Super admin, two-step on); that is audited.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { writeFileSync } from 'node:fs';
import { parseArgs, requireEnv, restClient, runIfMain, targetFrom } from './lib.mjs';

export const COLUMNS = [
  'id',
  'provider',
  'event_id',
  'product_id',
  'app_user_id',
  'received_at',
  'resolved_at',
  'note',
];

const cell = (v) => {
  const s = v == null ? '' : String(v);
  // Quote when needed; a leading = + - @ is prefixed so a spreadsheet never runs it as a formula.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(rows) {
  return [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}

export async function fetchUnmatched(db, { all = false } = {}) {
  const filter = all ? '' : '&resolved_at=is.null';
  return db.select('unmatched_store_events', `select=${COLUMNS.join(',')}${filter}&order=received_at.asc`);
}

async function main(argv) {
  const args = parseArgs(argv);
  targetFrom(args);
  const env = requireEnv(process.env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const rows = await fetchUnmatched(restClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY), {
    all: args.all === true,
  });
  const csv = toCsv(rows);
  if (typeof args.out === 'string') {
    writeFileSync(args.out, csv);
    console.error(`${rows.length} events written to ${args.out}`);
  } else process.stdout.write(csv);
  return 0;
}

runIfMain(import.meta.url, main);
