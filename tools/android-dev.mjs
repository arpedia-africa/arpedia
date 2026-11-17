#!/usr/bin/env node
// Build and install the Android debug app on a running emulator or phone, with a JDK 17+.
//   node tools/android-dev.mjs [device]     (default: first adb device)
// On Windows, JAVA_HOME falls back to Android Studio's bundled JBR when it isn't set.
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
const jbr = 'C:/Program Files/Android/Android Studio/jbr';
if (!env.JAVA_HOME && existsSync(jbr)) env.JAVA_HOME = jbr;
if (!env.ANDROID_HOME && env.LOCALAPPDATA) env.ANDROID_HOME = join(env.LOCALAPPDATA, 'Android', 'Sdk');

const device =
  process.argv[2] ??
  execSync('adb devices', { encoding: 'utf8' })
    .split(/\r?\n/)
    .slice(1)
    .find((l) => /\tdevice$/.test(l))
    ?.split('\t')[0];
if (!device) {
  console.error('No Android device or emulator found (adb devices).');
  process.exit(1);
}

const child = spawn('npx', ['expo', 'run:android', '--no-bundler', '--device', device], {
  cwd: join(root, 'apps/mobile'),
  env,
  stdio: 'inherit',
  shell: true,
});
child.on('exit', (code) => process.exit(code ?? 1));
