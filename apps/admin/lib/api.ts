import { serverSupabase } from './supabase/server';

/** The api Worker (workers/api). Local: `pnpm dev:workers` on :8787. */
const API_URL = process.env.ARPEDIA_API_URL ?? 'http://127.0.0.1:8787';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** POST to the api Worker as the signed-in staff member (their Supabase JWT). */
export async function api<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  const supabase = await serverSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, status: 401, error: 'Your session ended. Sign in again.' };
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach the server. Check your connection and try again." };
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const error = json.error && json.error !== 'invalid_request' ? json.error : 'Something went wrong. Try again.';
    return { ok: false, status: res.status, error };
  }
  return { ok: true, data: json };
}
