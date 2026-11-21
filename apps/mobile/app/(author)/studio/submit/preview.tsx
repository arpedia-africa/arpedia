import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { EmptyState, Screen, Skeleton, useTheme } from '@arpedia/ui';
import { creditsToNaira, formatKobo, perReadEarningKobo } from '@arpedia/core';
import { isNetworkError, useSession } from '../../../../features/01/session';
import { useTrack } from '../../../../features/11/analytics';
import {
  SubmitError,
  submitRevision,
  submitStep,
  useRevisionStatus,
  type RevisionStatus,
} from '../../../../features/11/submit';
import { StepFoot, SubmitPreviewView } from '../../../../features/11/SubmitViews';

const num = (n: number) => n.toLocaleString('en-NG');

/**
 * s-studio-preview (rule 21): readiness score, checklist, price, what a full read earns, rights
 * toggle. Submit for review stays off while a blocking flag is open and says what remains.
 */
export default function SubmitPreview() {
  const { s } = useTheme();
  const track = useTrack();
  const qc = useQueryClient();
  const uid = useSession()?.user.id;
  const { rev } = useLocalSearchParams<{ rev: string }>();
  const status = useRevisionStatus(rev);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = status.data;

  const back = () => (router.canGoBack() ? router.back() : router.replace(submitStep('chapters', rev)));

  const submit = async () => {
    if (!d) return;
    setBusy(true);
    setError(null);
    try {
      await submitRevision(rev);
      track('book_submitted', { price_credits: d.price_credits ?? 0, readiness: d.readiness ?? 0 });
      void qc.invalidateQueries({ queryKey: ['studio-books', uid] });
      void qc.invalidateQueries({ queryKey: ['studio-home', uid] });
      router.replace(submitStep('done', rev));
    } catch (e) {
      setError(e instanceof SubmitError ? e.message : 'Couldn’t send your book. Try again.');
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (status.isError && !d) {
    const offline = isNetworkError(status.error);
    body = (
      <EmptyState
        title={offline ? 'You’re offline' : 'Couldn’t open your preview'}
        body={
          offline
            ? 'Connect to see your book before you submit.'
            : 'Something went wrong on our side. Try again.'
        }
        action={{ label: 'Try again', onPress: () => void status.refetch() }}
      />
    );
  } else if (!d) {
    body = (
      <View style={{ padding: s(16), gap: s(16) }} accessibilityLabel="Loading">
        <Skeleton height={s(96)} radius={s(14)} />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={s(16)} />
        ))}
        <Skeleton height={s(88)} radius={s(14)} />
      </View>
    );
  } else {
    const m = model(d);
    body = (
      <SubmitPreviewView
        // Page previews need the working copy's read link for authors (flow 12 has it for staff only).
        pages={null}
        readiness={m.readiness}
        readinessLabel={m.label}
        checklist={m.checklist}
        price={m.price}
        earn={m.earn}
        agreed={agreed}
        onAgree={setAgreed}
        blockers={error ?? m.blockers}
        onBack={back}
      />
    );
  }

  const blocked = !d || d.blocking || !d.chapters_confirmed;
  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={
        <StepFoot
          label={d?.blocking ? 'Fix what’s left to submit' : 'Submit for review'}
          onPress={() => void submit()}
          loading={busy}
          disabled={blocked || !agreed || busy}
        />
      }
    >
      {body}
    </Screen>
  );
}

function model(d: RevisionStatus) {
  const price = d.price_credits ?? 0;
  const readiness = Math.max(0, Math.min(100, d.readiness ?? 0));
  const coverFlag = d.flags.find((f) => f.check_key.includes('cover'));
  const blocking = d.flags.filter((f) => f.blocking);
  return {
    readiness,
    label: blocking.length ? 'Fix what’s left first' : readiness >= 90 ? 'Ready for review' : 'Almost ready',
    checklist: [
      { k: 'File read and cleaned', v: 'Done' },
      { k: 'Chapters confirmed', v: d.chapters_confirmed ? 'Done' : 'Still to do' },
      { k: `Free ${Math.round(d.preview_percent ?? 10)}% preview`, v: 'Built' },
      { k: 'Cover', v: coverFlag ? (coverFlag.blocking ? 'Needs a fix' : 'We’ll adjust it') : 'Good size' },
      ...blocking.filter((f) => f !== coverFlag).map((f) => ({ k: f.message, v: 'Still to fix' })),
    ],
    price: {
      k: `${num(d.words ?? 0)} words → ${num(d.pages ?? 0)} pages`,
      v: `${num(price)} credits (₦${num(creditsToNaira(price))})`,
    },
    earn: formatKobo(perReadEarningKobo(price)),
    blockers: blocking.length
      ? `Before you submit: ${blocking.map((f) => f.suggestion ?? f.message).join(' ')}`
      : null,
  };
}
