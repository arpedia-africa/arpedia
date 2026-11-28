#!/usr/bin/env node
// Build the release APK the CI android job builds (kit gallery on, x86_64), then install it.
//   node tools/android-release.mjs [--no-prebuild] [--no-install] [--arch arm64-v8a] [--serial c1212d5c]
// --arch arm64-v8a builds for a real phone (default x86_64, the emulator); --serial picks the adb device.
// Same env as CI: EXPO_PUBLIC_KIT=1, NODE_ENV=production. On Windows it uses Android Studio's
// bundled JBR when present (the RN build needs JDK 17+; the PATH java may be older).
//
// --staging: the staging test build (owner decision, 24 Nov). "Arpedia Test", com.arpedia.reader.staging,
// arm64-v8a, beside v25 and the release app. Kit gallery off, test store on (the staging api Worker
// answers it only with TEST_STORE=1), push off unless google-services.json (GOOGLE_SERVICES_JSON, else
// apps/mobile/google-services.json) has that app id; the same rule holds for the release build. Server
// addresses come from EXPO_PUBLIC_SUPABASE_URL, _SUPABASE_ANON_KEY, _API_URL and _CHAT_URL in the shell;
// it stops if one is missing or points at this PC or production. Signed from ANDROID_KEYSTORE_PATH,
// ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD (as fastlane does).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SERVER_VARS, STAGING_APP_ID, stagingBuildEnv, stagingEnvProblems } from './launch/staging-build.mjs';

// google-services.json from GOOGLE_SERVICES_JSON or apps/mobile (the same check the config plugin makes).
const { firebaseHas } = createRequire(import.meta.url)('../apps/mobile/plugins/google-services.js');

const PRODUCTION_APP_ID = 'com.arpedia.reader';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = join(root, 'apps/mobile');
const argv = process.argv.slice(2);
const flag = (name, def) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : def);
const args = new Set(argv);
const staging = args.has('--staging');
const arch = flag('--arch', staging ? 'arm64-v8a' : 'x86_64');
const serial = flag('--serial', process.env.ANDROID_SERIAL);
// Push only when Firebase has a client for the release id (else the app never asks for a token).
let env = {
  ...process.env,
  EXPO_PUBLIC_KIT: '1',
  NODE_ENV: 'production',
  EXPO_PUBLIC_PUSH: firebaseHas(PRODUCTION_APP_ID) ? '1' : '0',
};
const jbr = 'C:/Program Files/Android/Android Studio/jbr';
if (existsSync(jbr)) env.JAVA_HOME = jbr;
if (!env.ANDROID_HOME && env.LOCALAPPDATA) env.ANDROID_HOME = join(env.LOCALAPPDATA, 'Android', 'Sdk');

const fail = (lines) => {
  console.error(`\n✗ staging build stopped:\n  - ${lines.join('\n  - ')}`);
  process.exit(1);
};

/** EXPO_PUBLIC_* keys in apps/mobile/.env* files: Expo would read them, so the shell must win. */
function dotenvKeys() {
  const keys = new Set();
  for (const f of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const p = join(mobile, f);
    if (!existsSync(p)) continue;
    for (const m of readFileSync(p, 'utf8').matchAll(/^\s*(EXPO_PUBLIC_[A-Z0-9_]+)\s*=/gm)) keys.add(m[1]);
  }
  return keys;
}

if (!staging && env.EXPO_PUBLIC_PUSH === '0')
  console.log(`ℹ No Firebase entry for ${PRODUCTION_APP_ID}: push is off in this build.`);

const signing = [];
if (staging) {
  const problems = stagingEnvProblems(process.env);
  const sign = [
    'ANDROID_KEYSTORE_PATH',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
  ];
  for (const k of sign) if (!process.env[k]) problems.push(`${k} is missing (release signing)`);
  if (process.env.ANDROID_KEYSTORE_PATH && !existsSync(resolve(process.env.ANDROID_KEYSTORE_PATH)))
    problems.push(`ANDROID_KEYSTORE_PATH does not exist (${process.env.ANDROID_KEYSTORE_PATH})`);
  if (problems.length) fail(problems);
  // Values from apps/mobile/.env* (local stack, kit) must not leak in: blank every one the shell lacks.
  for (const k of dotenvKeys()) if (!(k in process.env) && !SERVER_VARS.includes(k)) env[k] = '';
  const firebase = firebaseHas(STAGING_APP_ID);
  env = stagingBuildEnv(env, { firebase });
  if (!firebase) console.log(`ℹ No Firebase entry for ${STAGING_APP_ID}: push is off in this build.`);
  signing.push(
    `-Pandroid.injected.signing.store.file="${resolve(process.env.ANDROID_KEYSTORE_PATH)}"`,
    `-Pandroid.injected.signing.store.password=${process.env.ANDROID_KEYSTORE_PASSWORD}`,
    `-Pandroid.injected.signing.key.alias=${process.env.ANDROID_KEY_ALIAS}`,
    `-Pandroid.injected.signing.key.password=${process.env.ANDROID_KEY_PASSWORD}`,
  );
}

function run(cmd, cmdArgs, cwd, shown = cmdArgs) {
  console.log(`\n▶ ${cmd} ${shown.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, { cwd, env, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const android = join(mobile, 'android');
if (!args.has('--no-prebuild')) {
  // The staging build changes the app id, so the native project is made again when switching.
  const gradle = join(android, 'app/build.gradle');
  const wasStaging = existsSync(gradle) && readFileSync(gradle, 'utf8').includes(STAGING_APP_ID);
  const clean = staging !== wasStaging && existsSync(gradle) ? ['--clean'] : [];
  run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install', ...clean], mobile);
}
// The bundle task only watches apps/mobile, so edits in packages/* would ship a stale bundle.
for (const dir of ['generated/assets/createBundleReleaseJsAndAssets', 'generated/assets/react/release']) {
  rmSync(join(android, 'app/build', dir), { recursive: true, force: true });
}
const gradlew = join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
const gradleArgs = ['assembleRelease', `-PreactNativeArchitectures=${arch}`];
if (process.platform === 'win32') gradleArgs.push('-I', `"${join(root, 'tools/android-short-cxx.gradle')}"`);
// Passwords stay out of the printed command.
run(`"${gradlew}"`, [...gradleArgs, ...signing], android, [
  ...gradleArgs,
  ...(signing.length ? ['(release signing from ANDROID_*)'] : []),
]);
if (!args.has('--no-install')) {
  run(
    'adb',
    [
      ...(serial ? ['-s', serial] : []),
      'install',
      '-r',
      join(mobile, 'android/app/build/outputs/apk/release/app-release.apk'),
    ],
    root,
  );
}
