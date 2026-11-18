// Chapter encryption (docs/prd/12-book-pipeline.md rule 17, flow 04 A.2–A.7): AES-256-GCM with a
// 12-byte random IV, file layout `IV | ciphertext | tag`, additional data `revision_id:path`.
// Chapter keys are wrapped by the master key the same way, with additional data `wrap:<label>`.
// WebCrypto only, so the same code runs in Workers, Node (tests, desk) and the reader.

export const KEY_BYTES = 32;
export const IV_BYTES = 12;
const TAG_BITS = 128;

const bytes = (u: Uint8Array) => new Uint8Array(u);
const text = (s: string) => new TextEncoder().encode(s);

const importKey = (raw: Uint8Array, use: ('encrypt' | 'decrypt')[]) => {
  if (raw.length !== KEY_BYTES) throw new RangeError('AES-256 keys are 32 bytes');
  return crypto.subtle.importKey('raw', bytes(raw), 'AES-GCM', false, use);
};

/** A fresh random 256-bit key. */
export const newKey = () => crypto.getRandomValues(new Uint8Array(KEY_BYTES));

/** Additional data that binds a sealed file to its revision and path. */
export const chapterAad = (revisionId: string, path: string) => `${revisionId}:${path}`;

export async function sealFile(key: Uint8Array, plain: Uint8Array, aad: string): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: text(aad), tagLength: TAG_BITS },
    await importKey(key, ['encrypt']),
    bytes(plain),
  );
  const out = new Uint8Array(IV_BYTES + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), IV_BYTES);
  return out;
}

/** Throws if the key, the additional data or any byte of the file is wrong. */
export async function openFile(key: Uint8Array, sealed: Uint8Array, aad: string): Promise<Uint8Array> {
  if (sealed.length < IV_BYTES + TAG_BITS / 8) throw new RangeError('sealed file too short');
  const plain = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: bytes(sealed.subarray(0, IV_BYTES)),
      additionalData: text(aad),
      tagLength: TAG_BITS,
    },
    await importKey(key, ['decrypt']),
    bytes(sealed.subarray(IV_BYTES)),
  );
  return new Uint8Array(plain);
}

export const wrapKey = (master: Uint8Array, key: Uint8Array, label: string) =>
  sealFile(master, key, `wrap:${label}`);
export const unwrapKey = (master: Uint8Array, wrapped: Uint8Array, label: string) =>
  openFile(master, wrapped, `wrap:${label}`);

/** Label a chapter key is wrapped under (chapter_uid null = the revision's preview key K_free). */
export const keyLabel = (revisionId: string, chapterUid: string | null) =>
  `${revisionId}:${chapterUid ?? 'free'}`;
