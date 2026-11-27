#!/usr/bin/env node
// Flow 17 rule 11: after the journeys, prove the money adds up, exactly.
//   1. Every reader's balance, bucket by bucket (credit_balances), equals the sum of their credit_ledger rows.
//   2. Every ledger row that pays an author earns exactly credits × ₦1.60 (160 kobo per credit, sign
//      included, so an undo or refund takes back exactly what the spend earned), and no other row earns.
//   3. Each author's earnings total equals their credits spent × ₦1.60.
//   node tools/journeys/money-check.mjs [--db supabase_db_arpedia]
// Reads the local database through `docker exec … psql` (the main stack; never staging or production).
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const db = args.includes('--db') ? args[args.indexOf('--db') + 1] : 'supabase_db_arpedia';
const KOBO_PER_CREDIT = 160; // ₦1.60 (CLAUDE.md: money rules)

const SQL = `
with buckets as (select unnest(enum_range(null::public.ledger_bucket))::text as bucket),
users as (select user_id from public.credit_ledger union select user_id from public.credit_balances),
held as (
  select u.user_id, b.bucket,
         coalesce((select (to_jsonb(cb) ->> b.bucket)::bigint from public.credit_balances cb
                   where cb.user_id = u.user_id), 0) as balance,
         coalesce((select sum(l.delta) from public.credit_ledger l
                   where l.user_id = u.user_id and l.bucket::text = b.bucket), 0) as ledger
  from users u cross join buckets b
),
earning_rows as (
  select id, user_id, reason, delta, author_id, author_earning_kobo
  from public.credit_ledger
  where author_earning_kobo <> 0 or author_id is not null
),
authors as (
  select author_id, -sum(delta) as credits, sum(author_earning_kobo) as kobo
  from public.credit_ledger where author_earning_kobo <> 0 group by author_id
)
select jsonb_build_object(
  'users', (select count(distinct user_id) from held),
  'ledger_rows', (select count(*) from public.credit_ledger),
  'authors', (select count(*) from authors),
  'author_kobo', (select coalesce(sum(kobo), 0) from authors),
  'balance_mismatches', (select coalesce(jsonb_agg(h), '[]') from held h where h.balance <> h.ledger),
  'row_mismatches', (select coalesce(jsonb_agg(e), '[]') from earning_rows e
                     where e.author_earning_kobo <> 0
                       and (e.author_id is null or e.author_earning_kobo <> -e.delta * ${KOBO_PER_CREDIT})),
  'author_mismatches', (select coalesce(jsonb_agg(a), '[]') from authors a
                        where a.kobo <> a.credits * ${KOBO_PER_CREDIT})
)::text;`;

const out = execFileSync(
  'docker',
  ['exec', '-i', db, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'],
  { input: SQL, encoding: 'utf8' },
).trim();
const r = JSON.parse(out);
const fails = [
  ['balance ≠ ledger', r.balance_mismatches],
  ['row earning ≠ credits × ₦1.60', r.row_mismatches],
  ['author total ≠ credits × ₦1.60', r.author_mismatches],
].filter(([, list]) => list.length);

console.log(
  `money check: ${r.users} readers, ${r.ledger_rows} ledger rows, ${r.authors} authors earning ` +
    `₦${(r.author_kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`,
);
for (const [what, list] of fails) {
  console.error(`✗ ${what} (${list.length}):`);
  for (const row of list.slice(0, 20)) console.error(`  ${JSON.stringify(row)}`);
}
if (fails.length) process.exit(1);
console.log('✓ every balance equals its ledger; author earnings are exactly credits × ₦1.60');
