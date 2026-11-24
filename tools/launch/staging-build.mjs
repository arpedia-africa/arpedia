// The staging test build (owner decision, 24 Nov): `tools/android-release.mjs --staging`.
// Arpedia Test (com.arpedia.reader.staging) talks to staging only. Every server address comes from
// EXPO_PUBLIC_*; the build stops if one is missing or points at this PC or at production.
import { wranglerConfig } from './lib.mjs';

export const STAGING_APP_ID = 'com.arpedia.reader.staging';
export const STAGING_APP_NAME = 'Arpedia Test';
export const SERVER_VARS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_CHAT_URL',
];
const URL_VARS = SERVER_VARS.filter((k) => k.endsWith('_URL'));
const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|10\.0\.2\.2|0\.0\.0\.0|\[::1\])$/i;

/** Hosts the production app uses: its Supabase project, api and chat Workers. */
export function productionHosts() {
  const api = wranglerConfig('api').env.production;
  const chat = wranglerConfig('chat').env?.production;
  const hosts = new Set(['api.arpedia.africa', 'chat.arpedia.africa']);
  for (const u of [api.vars.SUPABASE_URL, api.vars.PUBLIC_API_URL, chat?.vars?.SUPABASE_URL]) {
    if (u) hosts.add(new URL(u).host);
  }
  // workers.dev names of the production Workers (staging ones end in -staging).
  for (const name of [api.name, chat?.name]) if (name) hosts.add(`${name}.`);
  return hosts;
}

/** What is wrong with these build variables for the staging test build; empty when it may build. */
export function stagingEnvProblems(env, prodHosts = productionHosts()) {
  const problems = [];
  for (const k of SERVER_VARS) if (!env[k]) problems.push(`${k} is missing`);
  for (const k of URL_VARS) {
    if (!env[k]) continue;
    let host;
    try {
      host = new URL(env[k]).hostname;
    } catch {
      problems.push(`${k} is not a URL`);
      continue;
    }
    if (LOCAL.test(host)) problems.push(`${k} points at this PC (${host})`);
    const full = new URL(env[k]).host;
    for (const p of prodHosts) {
      if (p.endsWith('.') ? full.startsWith(p) : full === p)
        problems.push(`${k} points at production (${full})`);
    }
  }
  return problems;
}

/** The build's own variables: staging, test store on, kit gallery off, push off without Firebase. */
export function stagingBuildEnv(base, { firebase }) {
  return {
    ...base,
    NODE_ENV: 'production',
    ARPEDIA_STAGING: '1',
    EXPO_PUBLIC_APP_ENV: 'staging',
    EXPO_PUBLIC_TEST_STORE: '1',
    EXPO_PUBLIC_KIT: '',
    EXPO_PUBLIC_PUSH: firebase ? '1' : '0',
  };
}
