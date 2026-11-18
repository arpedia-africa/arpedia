import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Json, OnboardingStep } from '@arpedia/core';
import { queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { profileKey } from './session';

// Onboarding steps save on the device first and sync when online (States: Offline), in order.
// The server keeps the furthest step, so a replayed or late save never moves anyone backwards.

interface Pending {
  uid: string;
  step: OnboardingStep;
  payload: Record<string, Json>;
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
    { name: 'arpedia.onboarding-queue', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

let flushing = false;
/** Send queued steps in order; stops at the first network failure and tries again later. */
export async function flushSteps() {
  if (flushing) return;
  flushing = true;
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    for (;;) {
      const next = useQueue.getState().pending[0];
      if (!next) break;
      // Another reader's queued steps never reach this account.
      if (next.uid !== uid) {
        useQueue.getState().shift();
        continue;
      }
      const { error } = await supabase.rpc('save_onboarding_step', {
        p_step: next.step,
        p_payload: next.payload,
      });
      // A refused payload (bad value) is dropped; a network error keeps it for later.
      if (error && (error.message?.match(/fetch|network/i) || !error.code)) break;
      useQueue.getState().shift();
      void queryClient.invalidateQueries({ queryKey: profileKey(uid) });
    }
  } finally {
    flushing = false;
  }
}

NetInfo.addEventListener((s) => {
  if (s.isConnected) void flushSteps();
});

/** Save a step for the signed-in reader: queued on the device, sent now if online. */
export async function saveStep(step: OnboardingStep, payload: Record<string, Json> = {}) {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return;
  useQueue.getState().push({ uid, step, payload });
  await flushSteps();
}

/** Seconds from signup_started to onboarding_completed (analytics only). */
let startedAt = 0;
export const onboardingClock = {
  start: () => {
    startedAt = Date.now();
  },
  seconds: () => (startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0),
};
