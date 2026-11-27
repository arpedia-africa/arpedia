// Firebase (FCM) for release builds (coordinator request, 27 Nov). The build reads google-services.json
// from GOOGLE_SERVICES_JSON (absolute, or relative to apps/mobile), else apps/mobile/google-services.json
// (gitignored, never committed). The release workflow writes it from the FIREBASE_GOOGLE_SERVICES_JSON
// secret before `expo prebuild`. It is wired in only when the file has a client for the build's app id
// (com.arpedia.reader, or .staging for Arpedia Test); otherwise the build goes on without push, and
// the build scripts set EXPO_PUBLIC_PUSH=0 from the same check so the app never asks for a token.
//   node apps/mobile/plugins/google-services.js <app id>   prints 1 or 0 (for EXPO_PUBLIC_PUSH)
const fs = require('node:fs');
const path = require('node:path');
const { withAppBuildGradle } = require('expo/config-plugins');

const MOBILE = path.join(__dirname, '..');
const DEBUG_OFF = '// google-services: no Firebase client for the .dev debug id';

/** Where this build's google-services.json is (it may not exist). */
function googleServicesPath(env = process.env, mobileDir = MOBILE) {
  const given = env.GOOGLE_SERVICES_JSON;
  return given ? path.resolve(mobileDir, given) : path.join(mobileDir, 'google-services.json');
}

/** The file exists, parses and has an Android client for appId. */
function firebaseHas(appId, file = googleServicesPath()) {
  if (!appId || !fs.existsSync(file)) return false;
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (j.client ?? []).some((c) => c.client_info?.android_client_info?.package_name === appId);
  } catch {
    return false;
  }
}

/** EXPO_PUBLIC_PUSH for a build of appId: '1' only when Firebase knows that id. */
function pushFlag(appId, file = googleServicesPath()) {
  return firebaseHas(appId, file) ? '1' : '0';
}

function withGoogleServices(config) {
  const appId = config.android?.package;
  const file = googleServicesPath();
  if (!firebaseHas(appId, file)) return config;
  config = { ...config, android: { ...config.android, googleServicesFile: file } };
  // The debug build is <id>.dev (dev-variant): without its own client the Gradle plugin would stop
  // the debug build, so its google-services task is skipped there (the dev build has no push).
  if (firebaseHas(`${appId}.dev`, file)) return config;
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(DEBUG_OFF)) {
      cfg.modResults.contents += `\n${DEBUG_OFF}\ntasks.configureEach { t ->\n    if (t.name == 'processDebugGoogleServices') t.enabled = false\n}\n`;
    }
    return cfg;
  });
}

module.exports = withGoogleServices;
module.exports.googleServicesPath = googleServicesPath;
module.exports.firebaseHas = firebaseHas;
module.exports.pushFlag = pushFlag;

if (require.main === module) process.stdout.write(`${pushFlag(process.argv[2])}\n`);
