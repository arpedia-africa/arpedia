// The api Worker's reader routes (/v1/reader, flow 04 Server): devices, keys, downloads.
// The caller's Supabase JWT goes along; the Worker decides with it.
import * as Device from 'expo-device';
import { supabase } from '@/lib/supabase';
import { devicePublicKey, saveDeviceId, savedDeviceId } from './crypto';

const API = process.env.EXPO_PUBLIC_API_URL ?? '';

export class WorkerError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new WorkerError('signed_out', 401);
  let res: Response;
  try {
    res = await fetch(`${API}/v1/reader${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new WorkerError('offline', 0);
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new WorkerError(json.error ?? 'failed', res.status);
  return json;
}

export interface SealedKey {
  chapter_uid: string | null;
  key: string;
}
export interface Licence {
  book_id: string;
  revision_id: string;
  device_id: string;
  issued_at: string;
  valid_until: string;
  chapter_uids: (string | null)[];
}
export interface KeysResponse {
  keys: SealedKey[];
  licence: Licence;
  signature: string;
  server_time: string;
}
export interface DownloadResponse extends KeysResponse {
  files: { path: string; url: string }[];
  expires_at: string;
}

/** Register this phone once (or again after its key changed) and remember the device id. */
export async function deviceId(): Promise<string> {
  const have = await savedDeviceId();
  if (have) return have;
  const public_key = await devicePublicKey();
  const name = [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || 'Android phone';
  const r = await call<{ device_id: string }>('/devices', { name: name.slice(0, 80), public_key });
  await saveDeviceId(r.device_id);
  return r.device_id;
}

export const fetchKeys = (b: {
  book_id: string;
  revision_id: string;
  device_id: string;
  chapter_uids?: string[];
  online?: boolean;
}) => call<KeysResponse>('/keys', b);

export const fetchDownload = (b: {
  book_id: string;
  revision_id: string;
  device_id: string;
  scope: 'whole' | 'owned';
  /** Reading online: works past the 3-device download limit (flow 10 rule 31). */
  online?: boolean;
}) => call<DownloadResponse>('/download', b);
