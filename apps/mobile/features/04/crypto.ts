// Flow 04 rule 4: the device's RSA-OAEP key pair (keys arrive wrapped to it) and a local master key
// that seals everything the reader keeps on disk. Both live in the Android Keystore through
// expo-secure-store. Plain chapter keys and text only ever exist in memory.
import * as SecureStore from 'expo-secure-store';
import { install } from 'react-native-quick-crypto';
import { newKey, openFile, sealFile } from '@arpedia/core';

// WebCrypto (crypto.subtle, getRandomValues) for Hermes, so @arpedia/core's seal code runs as is.
install();

const PRIVATE = 'reader.device.pkcs8';
const PUBLIC = 'reader.device.spki';
const MASTER = 'reader.master';
const DEVICE_ID = 'reader.device.id';

export const b64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
export const unb64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' } as const;

let privateKey: Promise<CryptoKey> | null = null;

/** The device key pair, made once (RSA-OAEP 2048). Returns the SPKI public key, base64. */
export async function devicePublicKey(): Promise<string> {
  const have = await SecureStore.getItemAsync(PUBLIC);
  if (have && (await SecureStore.getItemAsync(PRIVATE))) return have;
  const pair = (await crypto.subtle.generateKey(
    { ...RSA, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ['encrypt', 'decrypt'],
  )) as CryptoKeyPair;
  const spki = b64(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)));
  const pkcs8 = b64(new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)));
  await SecureStore.setItemAsync(PRIVATE, pkcs8);
  await SecureStore.setItemAsync(PUBLIC, spki);
  await SecureStore.deleteItemAsync(DEVICE_ID);
  privateKey = null;
  return spki;
}

function devicePrivateKey(): Promise<CryptoKey> {
  privateKey ??= (async () => {
    const pkcs8 = await SecureStore.getItemAsync(PRIVATE);
    if (!pkcs8) throw new Error('no_device_key');
    return crypto.subtle.importKey('pkcs8', unb64(pkcs8), RSA, false, ['decrypt']);
  })();
  return privateKey;
}

/** A chapter key the Worker sealed to this device. */
export async function unsealKey(sealedB64: string): Promise<Uint8Array> {
  const raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, await devicePrivateKey(), unb64(sealedB64));
  return new Uint8Array(raw);
}

export const savedDeviceId = () => SecureStore.getItemAsync(DEVICE_ID);
export const saveDeviceId = (id: string) => SecureStore.setItemAsync(DEVICE_ID, id);

let master: Promise<Uint8Array> | null = null;
function masterKey(): Promise<Uint8Array> {
  master ??= (async () => {
    const have = await SecureStore.getItemAsync(MASTER);
    if (have) return unb64(have);
    const k = newKey();
    await SecureStore.setItemAsync(MASTER, b64(k));
    return k;
  })();
  return master;
}

/** Seal bytes for app-private storage (key bundles); `label` binds them to their place. */
export async function sealLocal(plain: Uint8Array, label: string) {
  return sealFile(await masterKey(), plain, `local:${label}`);
}
export async function openLocal(sealed: Uint8Array, label: string) {
  return openFile(await masterKey(), sealed, `local:${label}`);
}

/** Sign-out and account deletion: forget every key (rule 72). */
export async function forgetReaderKeys() {
  master = null;
  privateKey = null;
  await Promise.all([PRIVATE, PUBLIC, MASTER, DEVICE_ID].map((k) => SecureStore.deleteItemAsync(k)));
}
