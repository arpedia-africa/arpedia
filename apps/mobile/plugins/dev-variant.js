// Debug builds install beside the release app: package com.arpedia.reader.dev, named "Arpedia Dev".
// Release stays com.arpedia.reader. Used by tools/android-dev.mjs (the fast screen loop).
const fs = require('node:fs');
const path = require('node:path');
const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

const SUFFIX = 'applicationIdSuffix ".dev"';

module.exports = function withDevVariant(config) {
  config = withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(SUFFIX)) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /(buildTypes\s*\{\s*debug\s*\{)/,
        `$1\n            ${SUFFIX}`,
      );
    }
    return cfg;
  });
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/debug/res/values');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'strings.xml'),
        '<resources>\n  <string name="app_name">Arpedia Dev</string>\n</resources>\n',
      );
      return cfg;
    },
  ]);
};
