#!/usr/bin/env node
// Copy CI/staging secrets from the local secrets file to GitHub Actions secrets without printing values.
// Usage:
//   node tools/sync-secrets.mjs --repo arpedia-africa/arpedia [--file C:\Users\PC\arpedia-secrets\secrets.env] [--dry-run]
// secrets.env: one NAME=value per line. A value starting with @ is a file next to secrets.env,
// uploaded base64-encoded (e.g. FCM_SERVICE_ACCOUNT_JSON=@fcm-service-account.json).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const arg = k => (args.indexOf(k) !== -1 ? args[args.indexOf(k) + 1] : undefined);
const repo = arg('--repo');
const file = resolve(arg('--file') || join(homedir(), 'arpedia-secrets', 'secrets.env'));
const dry = args.includes('--dry-run');
if (!repo) { console.error('Usage: node tools/sync-secrets.mjs --repo owner/name [--file path] [--dry-run]'); process.exit(1); }
if (!existsSync(file)) { console.error(`Secrets file not found: ${file}`); process.exit(1); }
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (file.toLowerCase().startsWith(projectRoot.toLowerCase())) {
  console.error('Refusing: the secrets file must live outside the project folder.'); process.exit(1);
}

// Staging + CI only. Production keys stay in the file until launch.
const NAMES = [
  'SUPABASE_STAGING_REF', 'SUPABASE_STAGING_URL', 'SUPABASE_STAGING_ANON_KEY', 'SUPABASE_STAGING_SERVICE_KEY', 'SUPABASE_STAGING_DB_PASSWORD',
  'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY',
  'VERCEL_TOKEN', 'VERCEL_TEAM_ID',
  'ANDROID_UPLOAD_KEYSTORE', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD', 'PLAY_SERVICE_ACCOUNT_JSON',
  'APPLE_TEAM_ID', 'MATCH_PASSWORD', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY',
  'APNS_KEY_ID', 'APNS_KEY', 'APPLE_SIGNIN_SERVICE_ID', 'APPLE_SIGNIN_KEY', 'FIREBASE_IOS_PLIST',
  'GOOGLE_VISION_API_KEY', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET',
  'FIREBASE_GOOGLE_SERVICES_JSON', 'FCM_SERVICE_ACCOUNT_JSON',
  'REVENUECAT_ANDROID_PUBLIC_KEY', 'REVENUECAT_IOS_PUBLIC_KEY', 'REVENUECAT_SECRET_KEY',
  'FLW_TEST_PUBLIC_KEY', 'FLW_TEST_SECRET_KEY', 'FLW_TEST_ENCRYPTION_KEY',
  'SENTRY_DSN_MOBILE', 'SENTRY_DSN_ADMIN', 'SENTRY_DSN_WORKERS', 'SENTRY_AUTH_TOKEN',
  'POSTHOG_KEY', 'POSTHOG_HOST', 'RESEND_API_KEY',
];

const env = {};
for (const line of readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

let ok = 0; const missing = [];
for (const name of NAMES) {
  let value = env[name];
  if (!value) { missing.push(name); console.log(`skip ${name} (not in file)`); continue; }
  let kind = '';
  if (value.startsWith('@')) {
    const p = join(dirname(file), value.slice(1));
    if (!existsSync(p)) { missing.push(name); console.log(`skip ${name} (file ${value.slice(1)} missing)`); continue; }
    value = readFileSync(p).toString('base64'); kind = ' (file, base64)';
  }
  if (!dry) execFileSync('gh', ['secret', 'set', name, '--repo', repo], { input: value, stdio: ['pipe', 'ignore', 'inherit'] });
  ok++; console.log(`${dry ? 'would set' : 'set'} ${name}${kind}`);
}
console.log(`\n${dry ? 'Dry run: would set' : 'Set'} ${ok} secrets on ${repo}.` + (missing.length ? ` Missing: ${missing.join(', ')}` : ''));
