import { compareVersions } from '@arpedia/core';
import { bearer, verifySupabaseJwt } from '@arpedia/core/jwt';
import { Hono } from 'hono';
import { serviceDb } from '../../db';
import type { AppEnv, Env } from '../../env';

// Flow 16 rule 30: the app reads config at start, on returning to foreground and at most once a
// minute. Public (a reader's token is optional and only picks their flag buckets), no secrets.
const appConfig = new Hono<AppEnv>();

interface FlagRule {
  key: string;
  enabled: boolean;
  rollout_percent: number;
  min_app_version: string | null;
}

interface PublicConfig {
  android_min_version: string | null;
  ios_min_version: string | null;
  force_update: boolean;
  maintenance: { on: boolean; message?: string };
  flag_rules: FlagRule[];
  copy: Record<string, string>;
}

const TTL_MS = 60_000;
let cached: { at: number; value: PublicConfig } | null = null;

async function load(env: Env): Promise<PublicConfig> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const { data, error } = await serviceDb(env).rpc('get_app_config', {});
  if (error) throw error;
  cached = { at: Date.now(), value: data as unknown as PublicConfig };
  return cached.value;
}

/** Same bucket as the database's _rollout_bucket: md5("<flag>:<user>"), first 8 hex digits, mod 100. */
async function bucket(flag: string, userId: string): Promise<number> {
  const digest = await crypto.subtle.digest('MD5', new TextEncoder().encode(`${flag}:${userId}`));
  return new DataView(digest).getUint32(0) % 100;
}

/** Resolve each flag for this user and app version (rule 27). Without a user only 100% flags are on. */
export async function resolveFlags(rules: FlagRule[], userId: string | null, appVersion: string | null) {
  const out: Record<string, boolean> = {};
  for (const f of rules) {
    let on = f.enabled;
    if (on && f.min_app_version)
      on = !!appVersion && (compareVersions(appVersion, f.min_app_version) ?? -1) >= 0;
    if (on) on = userId ? (await bucket(f.key, userId)) < f.rollout_percent : f.rollout_percent === 100;
    out[f.key] = on;
  }
  return out;
}

appConfig.get('/', async (c) => {
  const version = c.req.query('v') ?? null;
  const platform = c.req.query('platform') === 'ios' ? 'ios' : 'android';
  let userId: string | null = null;
  const token = bearer(c.req.header('Authorization'));
  if (token) {
    try {
      userId = (
        await verifySupabaseJwt(token, {
          supabaseUrl: c.env.SUPABASE_URL,
          hsSecret: c.env.APP_ENV === 'local' ? c.env.SUPABASE_JWT_SECRET : undefined,
        })
      ).sub;
    } catch {
      // A bad or expired token still gets the public config.
    }
  }
  const cfg = await load(c.env);
  const min = platform === 'ios' ? cfg.ios_min_version : cfg.android_min_version;
  const below = !!version && !!min && (compareVersions(version, min) ?? 0) < 0;
  c.header('Cache-Control', userId ? 'private, max-age=60' : 'public, max-age=60');
  return c.json({
    min_version: min,
    force_update: cfg.force_update === true && below,
    maintenance: cfg.maintenance?.on
      ? { on: true, message: cfg.maintenance.message ?? '' }
      : { on: false, message: null },
    flags: await resolveFlags(cfg.flag_rules ?? [], userId, version),
    copy: cfg.copy ?? {},
  });
});

export default appConfig;
