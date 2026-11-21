import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Btn, EmptyState, Field, Screen, Sheet, Skeleton, useTheme } from '@arpedia/ui';
import { creditsToNaira } from '@arpedia/core';
import { isNetworkError } from '../../../../features/01/session';
import { useTrack } from '../../../../features/11/analytics';
import { STUDIO_BOOKS } from '../../../../features/11/studio';
import {
  confirmChapters,
  SubmitError,
  submitStep,
  useRevisionBook,
  useRevisionChapters,
  useRevisionStatus,
  type ChapterEdit,
} from '../../../../features/11/submit';
import { StepFoot, SubmitChaptersView, type ChapterRow } from '../../../../features/11/SubmitViews';

const num = (n: number) => n.toLocaleString('en-NG');

/**
 * s-studio-chapters (rules 19–20): detected chapters with word counts and plain flags; rename, add a
 * missing title, merge up. Edits are kept here and sent once on Continue (`/v1/books/confirm`), which
 * re-splits long chapters and recounts.
 */
export default function SubmitChapters() {
  const { s } = useTheme();
  const track = useTrack();
  const qc = useQueryClient();
  const { rev } = useLocalSearchParams<{ rev: string }>();
  const status = useRevisionStatus(rev);
  const book = useRevisionBook(rev);
  const chapters = useRevisionChapters(rev, !!status.data);
  const [{ rows, edits }, setState] = useState<{ rows: ChapterRow[] | null; edits: ChapterEdit[] }>({
    rows: null,
    edits: [],
  });
  const [renaming, setRenaming] = useState<{ ord: number; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (chapters.data && !rows)
      setState({
        rows: chapters.data.map((c, k) => ({
          ord: c.ord,
          title: c.title.trim() || null,
          words: c.words,
          canMerge: k > 0,
        })),
        edits: [],
      });
  }, [chapters.data, rows]);

  const back = () => (router.canGoBack() ? router.back() : router.replace(STUDIO_BOOKS));

  // Rows and edits change together, so a double tap can't record an edit against a stale list.
  // Edit ords are positions in the list as it stands, as applyEdits replays them in order.
  const edit = (ord: number, change: (rows: ChapterRow[], i: number) => ChapterEdit | null) =>
    setState((st) => {
      if (!st.rows) return st;
      const rows = [...st.rows];
      const e = change(
        rows,
        rows.findIndex((c) => c.ord === ord),
      );
      return e ? { rows: rows.map((c, k) => ({ ...c, canMerge: k > 0 })), edits: [...st.edits, e] } : st;
    });
  const rename = (ord: number, title: string) =>
    edit(ord, (rows, i) => {
      if (i < 0) return null;
      rows[i] = { ...rows[i]!, title };
      return { op: 'rename', ord: i, title };
    });
  const merge = (ord: number) =>
    edit(ord, (rows, i) => {
      if (i < 1) return null;
      rows[i - 1] = { ...rows[i - 1]!, words: rows[i - 1]!.words + rows[i]!.words };
      rows.splice(i, 1);
      return { op: 'merge_up', ord: i };
    });

  const next = async () => {
    setBusy(true);
    setError(null);
    try {
      await confirmChapters(rev, edits);
      track('chapters_confirmed', {
        merged: edits.filter((e) => e.op === 'merge_up').length,
        renamed: edits.filter((e) => e.op === 'rename').length,
      });
      void qc.invalidateQueries({ queryKey: ['revision-status', rev] });
      router.replace(submitStep('preview', rev));
    } catch (e) {
      setError(e instanceof SubmitError ? e.message : 'Couldn’t save your chapters. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const d = status.data;
  const failed = status.isError || chapters.isError;
  const title = book.data?.books?.title ?? 'your book';
  const price = d?.price_credits ?? 0;
  let body;
  if (failed && !rows) {
    const offline = isNetworkError(status.error ?? chapters.error);
    body = (
      <EmptyState
        title={offline ? 'You’re offline' : 'Couldn’t open your chapters'}
        body={offline ? 'Connect to check your chapters.' : 'Something went wrong on our side. Try again.'}
        action={{
          label: 'Try again',
          onPress: () => void Promise.all([status.refetch(), chapters.refetch()]),
        }}
      />
    );
  } else if (!d || !rows) {
    body = (
      <View style={{ padding: s(16), gap: s(12) }} accessibilityLabel="Loading">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={s(44)} radius={s(10)} />
        ))}
      </View>
    );
  } else {
    body = (
      <SubmitChaptersView
        sub={`We found ${num(rows.length)} chapter${rows.length === 1 ? '' : 's'} in ${title}.`}
        flags={[
          ...(error ? [{ tone: 'err' as const, text: error }] : []),
          ...d.flags.map((f) => ({
            tone: f.blocking ? ('warn' as const) : ('info' as const),
            text: f.message,
          })),
        ]}
        chapters={rows}
        totals={{
          words: `${num(d.words ?? 0)} words`,
          pages: `${num(d.pages ?? 0)} pages`,
          price: `${num(price)} credits · ₦${num(creditsToNaira(price))}`,
        }}
        onRename={(ord) => setRenaming({ ord, title: rows.find((c) => c.ord === ord)?.title ?? '' })}
        onMerge={merge}
        onBack={back}
      />
    );
  }

  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={
        <StepFoot
          label="Looks right, continue"
          onPress={() => void next()}
          loading={busy}
          disabled={!rows || busy}
        />
      }
    >
      {body}
      <Sheet open={!!renaming} onClose={() => setRenaming(null)} title="Chapter title">
        {renaming ? (
          <View style={{ gap: s(16) }}>
            <Field
              label="Title"
              value={renaming.title}
              onChangeText={(t) => setRenaming({ ...renaming, title: t })}
              maxLength={200}
              autoCapitalize="words"
              autoFocus
            />
            <Btn
              label="Save"
              block
              disabled={!renaming.title.trim()}
              onPress={() => {
                rename(renaming.ord, renaming.title.trim());
                setRenaming(null);
              }}
            />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
