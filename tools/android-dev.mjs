#!/usr/bin/env node
// Fast screen loop: build and install the dev build (debug, expo-dev-client) as com.arpedia.reader.dev
// ("Arpedia Dev"), beside the release app com.arpedia.reader. Then edits reload from Metro in seconds.
//   node tools/android-dev.mjs [serial] [--no-build] [--no-prebuild] [--arch arm64-v8a] [--route /kit]
// - serial: adb device (default ANDROID_SERIAL, else the first device)
// - --arch: default from the device's ABI (arm64-v8a on the phone, x86_64 on the emulator)
// - --no-build: skip prebuild + gradle + install (dev build already on the device)
// - --route: open the dev build on Metro (start it first: `pnpm dev:mobile`), then this route
// Always runs `adb reverse tcp:8081 tcp:8081` so the device reaches Metro on the PC.
// On Windows, JAVA_HOME falls back to Android Studio's bundled JBR (the RN build needs JDK 17+).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEV_PACKAGE = 'com.arpedia.reader.dev';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = join(root, 'apps/mobile');
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i === -1 ? def : argv.splice(i, 2)[1];
};
const route = opt('--route');
let arch = opt('--arch');
const flags = new Set(argv.filter((a) => a.startsWith('--')));
// The .dev package comes from the debug build type (apps/mobile/plugins/dev-variant.js).
const env = { ...process.env };
const jbr = 'C:/Program Files/Android/Android Studio/jbr';
if (!env.JAVA_HOME && existsSync(jbr)) env.JAVA_HOME = jbr;
if (!env.ANDROID_HOME && env.LOCALAPPDATA) env.ANDROID_HOME = join(env.LOCALAPPDATA, 'Android', 'Sdk');

const serial =
  argv.find((a) => !a.startsWith('--')) ??
  process.env.ANDROID_SERIAL ??
  execFileSync('adb', ['devices'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .slice(1)
    .find((l) => /\tdevice$/.test(l))
    ?.split('\t')[0];
if (!serial) {
  console.error('No Android device or emulator found (adb devices).');
  process.exit(1);
}
const adb = (...a) => execFileSync('adb', ['-s', serial, ...a], { encoding: 'utf8' });
arch ??= adb('shell', 'getprop', 'ro.product.cpu.abi').trim() || 'arm64-v8a';

function run(cmd, cmdArgs, cwd) {
  console.log(`\n▶ ${cmd} ${cmdArgs.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, { cwd, env, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!flags.has('--no-build')) {
  if (!flags.has('--no-prebuild'))
    run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], mobile);
  const android = join(mobile, 'android');
  const gradlew = join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  const gradleArgs = ['assembleDebug', `-PreactNativeArchitectures=${arch}`];
  if (process.platform === 'win32')
    gradleArgs.push('-I', `"${join(root, 'tools/android-short-cxx.gradle')}"`);
  run(`"${gradlew}"`, gradleArgs, android);
  run(
    'adb',
    ['-s', serial, 'install', '-r', join(android, 'app/build/outputs/apk/debug/app-debug.apk')],
    root,
  );
}

adb('reverse', 'tcp:8081', 'tcp:8081');
console.log(`adb reverse tcp:8081 ready on ${serial}`);

if (route) {
  const metro = encodeURIComponent('http://127.0.0.1:8081');
  adb(
    'shell',
    'am',
    'start',
    '-W',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    `exp+arpedia://expo-development-client/?url=${metro}`,
    DEV_PACKAGE,
  );
  await new Promise((r) => setTimeout(r, 4000));
  adb(
    'shell',
    'am',
    'start',
    '-W',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    `arpedia://${route.replace(/^\//, '').replace(/&/g, '\\&')}`,
    DEV_PACKAGE,
  );
  console.log(`opened ${route} in ${DEV_PACKAGE}`);
}
