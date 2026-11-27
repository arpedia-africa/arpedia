import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const plugin = createRequire(import.meta.url)('../../apps/mobile/plugins/google-services.js');
const { firebaseHas, googleServicesPath, pushFlag } = plugin;

const dir = mkdtempSync(join(tmpdir(), 'gs-'));
const client = (id) => ({ client_info: { android_client_info: { package_name: id } } });
const write = (name, body) => {
  const f = join(dir, name);
  writeFileSync(f, typeof body === 'string' ? body : JSON.stringify(body));
  return f;
};
const prod = write('prod.json', { client: [client('com.arpedia.reader')] });
const both = write('both.json', { client: [client('com.arpedia.reader'), client('com.arpedia.reader.dev')] });

describe('google-services.json for release builds', () => {
  it('reads GOOGLE_SERVICES_JSON, relative to apps/mobile, else apps/mobile/google-services.json', () => {
    expect(googleServicesPath({ GOOGLE_SERVICES_JSON: prod }, '/m')).toBe(prod);
    expect(googleServicesPath({ GOOGLE_SERVICES_JSON: 'x/gs.json' }, '/m')).toBe(join('/m', 'x/gs.json'));
    expect(googleServicesPath({}, '/m')).toBe(join('/m', 'google-services.json'));
  });

  it('turns push on only for an app id the file has a client for', () => {
    expect(pushFlag('com.arpedia.reader', prod)).toBe('1');
    expect(pushFlag('com.arpedia.reader.staging', prod)).toBe('0');
    expect(pushFlag('com.arpedia.reader', join(dir, 'missing.json'))).toBe('0');
    expect(firebaseHas('com.arpedia.reader', write('bad.json', '{not json'))).toBe(false);
  });

  it('wires the file into the config only when it has the build id', () => {
    const was = process.env.GOOGLE_SERVICES_JSON;
    try {
      process.env.GOOGLE_SERVICES_JSON = prod;
      const on = plugin({ name: 'Arpedia', slug: 'arpedia', android: { package: 'com.arpedia.reader' } });
      expect(on.android.googleServicesFile).toBe(prod);
      const staging = plugin({
        name: 'Arpedia Test',
        slug: 'arpedia',
        android: { package: 'com.arpedia.reader.staging' },
      });
      expect(staging.android.googleServicesFile).toBeUndefined();
      process.env.GOOGLE_SERVICES_JSON = both;
      expect(
        plugin({ name: 'Arpedia', slug: 'arpedia', android: { package: 'com.arpedia.reader' } }).android
          .googleServicesFile,
      ).toBe(both);
    } finally {
      if (was === undefined) delete process.env.GOOGLE_SERVICES_JSON;
      else process.env.GOOGLE_SERVICES_JSON = was;
    }
  });
});
