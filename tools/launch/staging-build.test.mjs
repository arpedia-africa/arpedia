import { describe, expect, it } from 'vitest';
import { wranglerConfig } from './lib.mjs';
import { stagingBuildEnv, stagingEnvProblems } from './staging-build.mjs';

const STAGING = wranglerConfig('api').env.staging.vars.SUPABASE_URL;
const PRODUCTION = wranglerConfig('api').env.production.vars.SUPABASE_URL;
const ok = {
  EXPO_PUBLIC_SUPABASE_URL: STAGING,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  EXPO_PUBLIC_API_URL: 'https://arpedia-api-staging.example.workers.dev',
  EXPO_PUBLIC_CHAT_URL: 'https://arpedia-chat-staging.example.workers.dev',
};

describe('staging test build variables', () => {
  it('builds with staging addresses', () => {
    expect(stagingEnvProblems(ok)).toEqual([]);
  });

  it('stops when one is missing', () => {
    const { EXPO_PUBLIC_CHAT_URL: _, ...rest } = ok;
    expect(stagingEnvProblems(rest)).toEqual(['EXPO_PUBLIC_CHAT_URL is missing']);
  });

  it('stops on this PC', () => {
    expect(stagingEnvProblems({ ...ok, EXPO_PUBLIC_API_URL: 'http://127.0.0.1:8787' })).toEqual([
      'EXPO_PUBLIC_API_URL points at this PC (127.0.0.1)',
    ]);
    expect(stagingEnvProblems({ ...ok, EXPO_PUBLIC_SUPABASE_URL: 'http://10.0.2.2:55321' })).toHaveLength(1);
  });

  it('stops on production', () => {
    expect(stagingEnvProblems({ ...ok, EXPO_PUBLIC_SUPABASE_URL: PRODUCTION })).toHaveLength(1);
    expect(stagingEnvProblems({ ...ok, EXPO_PUBLIC_API_URL: 'https://api.arpedia.africa' })).toHaveLength(1);
    expect(
      stagingEnvProblems({ ...ok, EXPO_PUBLIC_CHAT_URL: 'https://arpedia-chat.example.workers.dev' }),
    ).toHaveLength(1);
  });

  it('turns the test store on, the kit off, and push off without Firebase', () => {
    const env = stagingBuildEnv({ EXPO_PUBLIC_KIT: '1' }, { firebase: false });
    expect(env).toMatchObject({
      EXPO_PUBLIC_APP_ENV: 'staging',
      EXPO_PUBLIC_TEST_STORE: '1',
      EXPO_PUBLIC_KIT: '',
      EXPO_PUBLIC_PUSH: '0',
      ARPEDIA_STAGING: '1',
    });
    expect(stagingBuildEnv({}, { firebase: true }).EXPO_PUBLIC_PUSH).toBe('1');
  });
});
