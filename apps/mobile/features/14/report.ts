import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useMemo } from 'react';
import type { ReportContentType, ReportReason } from '@arpedia/core';
import { supabase } from '@/lib/supabase';
import { useTrack } from './analytics';

// Reports from any entry point (message, DM, profile, book, review, comment). Offline they are saved on
// the device and sent on reconnect with the original time (States: Offline); `create_report` keeps
// that time for the queue's age and due date.

export interface ReportInput {
  content_type: ReportContentType;
  content_id: string;
  reason: ReportReason;
  details?: string | null;
  also_block?: boolean;
}
interface Pending extends ReportInput {
  uid: string;
  at: string;
}
interface QueueState {
  pending: Pending[];
  push: (p: Pending) => void;
  shift: () => void;
}

const useQueue = create<QueueState>()(
  persist(
    (set) => ({
      pending: [],
      push: (p) => set((st) => ({ pending: [...st.pending, p] })),
      shift: () => set((st) => ({ pending: st.pending.slice(1) })),
    }),
    { name: 'arpedia.report-queue', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export const REPORT_SENT =
  "Report sent. We'll look at it within 24 hours for serious reports and within 3 days for others.";
export const REPORT_SAVED = "Report saved. It will send when you're online.";

/** Plain words for a refused report; anything else is a retryable failure. */
export function reportErrorCopy(message: string): string {
  if (/already_reported/.test(message)) return 'You already reported this.';
  if (/daily_limit/.test(message)) return "You've sent a lot of reports today. Try again tomorrow.";
  if (/own_content/.test(message)) return "You can't report your own post.";
  if (/not_found/.test(message)) return 'This is no longer available.';
  if (/reason_not_allowed/.test(message)) return 'Pick another reason.';
  return "Couldn't send the report. Try again.";
}

async function send(r: ReportInput, at: string | null) {
  const { data, error } = await supabase.rpc('create_report', {
    p_content_type: r.content_type,
    p_content_id: r.content_id,
    p_reason: r.reason,
    p_details: r.details ?? undefined,
    p_also_block: r.also_block ?? false,
    p_at: at ?? undefined,
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}

let flushing = false;
/** Send queued reports in order; a refused one (already reported, gone, limit) is dropped. */
export async function flushReports() {
  if (flushing) return;
  flushing = true;
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    for (;;) {
      const next = useQueue.getState().pending[0];
      if (!next) break;
      if (next.uid !== uid) {
        useQueue.getState().shift();
        continue;
      }
      try {
        await send(next, next.at);
      } catch (e) {
        // Refused values (22xxx, 23xxx, 42501, P0002, 54000, 0A000) won't succeed later; keep the rest.
        const code = String((e as { code?: string }).code ?? '');
        if (!/^(22|23|42501|P0002|54000|0A000)/.test(code)) break;
      }
      useQueue.getState().shift();
    }
  } finally {
    flushing = false;
  }
}

NetInfo.addEventListener((s) => {
  if (s.isConnected) void flushReports();
});

/**
 * Report something. Online it goes straight to `create_report` and returns the ref; offline it is
 * saved and returns `null` (show REPORT_SAVED).
 */
export async function createReport(r: ReportInput, offline: boolean): Promise<string | null> {
  if (offline) {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) throw new Error('sign in');
    useQueue.getState().push({ ...r, uid, at: new Date().toISOString() });
    return null;
  }
  return send(r, null);
}

/**
 * createReport with flow 14's events: `report_started {content_type}` when the sheet opens and
 * `report_sent {content_type, reason, also_block, queued}` once it is sent or saved for later.
 */
export function useReport() {
  const track = useTrack();
  return useMemo(
    () => ({
      started: (content_type: ReportContentType) => track('report_started', { content_type }),
      send: async (r: ReportInput, offline: boolean) => {
        const ref = await createReport(r, offline);
        track('report_sent', {
          content_type: r.content_type,
          reason: r.reason,
          also_block: !!r.also_block,
          queued: ref === null,
        });
        return ref;
      },
    }),
    [track],
  );
}
