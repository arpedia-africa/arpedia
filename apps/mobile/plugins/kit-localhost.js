// Kit release builds (EXPO_PUBLIC_KIT=1, CI e2e and the pixel gate) may load plain http from
// 127.0.0.1/localhost only, so tools/parity.mjs can serve the prototype reference over adb reverse to
// the release app's WebView. Store builds (no EXPO_PUBLIC_KIT) get none of this. Debug builds keep
// Expo's own cleartext setting for Metro, so the overlay lives in the release source set only.
const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

const MANIFEST = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:networkSecurityConfig="@xml/kit_network" />
</manifest>
`;
const NETWORK = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">127.0.0.1</domain>
    <domain includeSubdomains="false">localhost</domain>
  </domain-config>
</network-security-config>
`;

module.exports = function withKitLocalhost(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const release = path.join(cfg.modRequest.platformProjectRoot, 'app/src/release');
      const manifest = path.join(release, 'AndroidManifest.xml');
      const xml = path.join(release, 'res/xml/kit_network.xml');
      if (process.env.EXPO_PUBLIC_KIT === '1') {
        fs.mkdirSync(path.dirname(xml), { recursive: true });
        fs.writeFileSync(manifest, MANIFEST);
        fs.writeFileSync(xml, NETWORK);
      } else {
        fs.rmSync(manifest, { force: true });
        fs.rmSync(xml, { force: true });
      }
      return cfg;
    },
  ]);
};
