#!/usr/bin/env node
// Build the release APK the CI android job builds (kit gallery on, x86_64), then install it.
//   node tools/android-release.mjs [--no-prebuild] [--no-install] [--arch arm64-v8a] [--serial c1212d5c]
// --arch arm64-v8a builds for a real phone (default x86_64, the emulator); --serial picks the adb device.
// Same env as CI: EXPO_PUBLIC_KIT=1, NODE_ENV=production. On Windows it uses Android Studio's
// bundled JBR when present (the RN build needs JDK 17+; the PATH java may be older).
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = join(root, 'apps/mobile');
const argv = process.argv.slice(2);
const flag = (name, def) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : def);
const args = new Set(argv);
const arch = flag('--arch', 'x86_64');
const serial = flag('--serial', process.env.ANDROID_SERIAL);
const env = { ...process.env, EXPO_PUBLIC_KIT: '1', NODE_ENV: 'production' };
const jbr = 'C:/Program Files/Android/Android Studio/jbr';
if (existsSync(jbr)) env.JAVA_HOME = jbr;
if (!env.ANDROID_HOME && env.LOCALAPPDATA) env.ANDROID_HOME = join(env.LOCALAPPDATA, 'Android', 'Sdk');

function run(cmd, cmdArgs, cwd) {
  console.log(`\n▶ ${cmd} ${cmdArgs.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, { cwd, env, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!args.has('--no-prebuild')) {
  run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], mobile);
}
const android = join(mobile, 'android');
// The bundle task only watches apps/mobile, so edits in packages/* would ship a stale bundle.
for (const dir of ['generated/assets/createBundleReleaseJsAndAssets', 'generated/assets/react/release']) {
  rmSync(join(android, 'app/build', dir), { recursive: true, force: true });
}
const gradlew = join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
const gradleArgs = ['assembleRelease', `-PreactNativeArchitectures=${arch}`];
if (process.platform === 'win32') gradleArgs.push('-I', `"${join(root, 'tools/android-short-cxx.gradle')}"`);
run(`"${gradlew}"`, gradleArgs, android);
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
