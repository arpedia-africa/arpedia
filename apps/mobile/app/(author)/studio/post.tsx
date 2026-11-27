import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, Sheet, useToast } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '../../../features/01/session';
import { rpcError } from '../../../features/03/UnlockSheet';
import { useOnline } from '../../../features/03/book';
import { authorPostsKey } from '../../../features/08/data';
import { useTrack } from '../../../features/11/analytics';
import { STUDIO } from '../../../features/11/application';
import { compact, useStudioBooks, useStudioHome } from '../../../features/11/studio';
import { BookPicker, StudioPostView, type StudioPostValues } from '../../../features/11/StudioCommsViews';

type Errors = Partial<Record<keyof StudioPostValues | 'form', string>>;
interface Draft extends StudioPostValues {
  book: string | null;
}

const UNTIL = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/** Refusal copy for `publish_author_post` (flow 08 and 14 rules); field errors go under the field. */
function postError(e: unknown): Errors {
  const { code, detail } = rpcError(e);
  const raw = (detail as { until?: unknown }).until;
  const until = typeof raw === 'string' && !raw.startsWith('9999') ? new Date(raw) : null;
  const by = until && !Number.isNaN(until.getTime()) ? ` until ${UNTIL.format(until)}` : '';
  switch (code) {
    case 'invalid_title':
      return { title: 'Add a title.' };
    case 'invalid_body':
      return { body: 'Write something for your readers.' };
    case 'rejected_by_rules':
      return { form: 'This post has words our community rules don’t allow. Edit it and post again.' };
    case 'rate_limited':
      return { form: 'You’ve posted 10 times today. Post again tomorrow.' };
    case 'book_not_found':
      return { form: 'That book isn’t live any more. Pick another book or post without one.' };
    case 'author_suspended':
      return { form: 'Your author account is paused, so you can’t post for now.' };
    case 'sanction_muted':
    case 'suspended':
      return { form: `You can’t post${by}. You can appeal from the email we sent.` };
    case 'account_banned':
      return { form: 'Your account can’t post any more.' };
    case 'network':
      return { form: 'No connection. Your post wasn’t sent. Your draft is saved, so try again.' };
    case 'signed_out':
      return { form: 'You’re signed out. Sign in again to post.' };
    default:
      return { form: 'Something went wrong. Your draft is saved, so try again.' };
  }
}

/**
 * s-studio-post: text post to followers and the author's club, optional link to one live book
 * (rule 31). `publish_author_post` stores it, tells followers (flow 15 push) and adds a line to
 * the author's community; the draft stays on the phone until a post goes out.
 */
export default function StudioPost() {
  const toast = useToast();
  const qc = useQueryClient();
  const track = useTrack();
  const online = useOnline();
  const uid = useSession()?.user.id;
  const home = useStudioHome(uid);
  const books = useStudioBooks(uid);
  const key = `arpedia.studio.post-draft.${uid ?? ''}`;
  const [draft, setDraft] = useState<Draft>({ title: '', body: '', book: null });
  const [errors, setErrors] = useState<Errors>({});
  const [picker, setPicker] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!uid) return;
    AsyncStorage.getItem(key)
      .then((v) => {
        if (v) setDraft(JSON.parse(v) as Draft);
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
      });
  }, [key, uid]);

  useEffect(() => {
    if (!uid || !loaded.current) return;
    const t = setTimeout(() => {
      AsyncStorage.setItem(key, JSON.stringify(draft)).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [draft, key, uid]);

  const live = (books.data ?? []).filter((b) => b.live_revision_no != null);
  const book = live.find((b) => b.book_id === draft.book) ?? null;
  const followers = home.data?.followers ?? 0;
  const audience = home.data?.club_group_id
    ? `${compact(followers)} followers + club`
    : `${compact(followers)} followers`;

  const publish = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('publish_author_post', {
        p_title: draft.title.trim(),
        p_body: draft.body.trim(),
        p_book: book?.book_id ?? undefined,
      });
      if (error) throw error;
      return data as { post_id: string; repeat: boolean };
    },
    onSuccess: ({ post_id, repeat }) => {
      if (!repeat) track('author_post_created', { has_book: !!book });
      AsyncStorage.removeItem(key).catch(() => {});
      if (uid) void qc.invalidateQueries({ queryKey: authorPostsKey(uid) });
      toast({ message: 'Posted to your followers' });
      router.replace({ pathname: '/post/[id]', params: { id: post_id } });
    },
    onError: (e) => setErrors(postError(e)),
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace(STUDIO));

  const post = () => {
    const next: Errors = {};
    if (!draft.title.trim()) next.title = 'Add a title.';
    if (draft.body.trim().length < 2) next.body = 'Write something for your readers.';
    if (!Object.keys(next).length && !online) {
      next.form = 'You’re offline. Your draft is saved; post when you’re back online.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    publish.mutate();
  };

  return (
    <Screen top="org" contentStyle={{ flexGrow: 1 }}>
      <StudioPostView
        values={draft}
        book={book?.title ?? null}
        audience={audience}
        errors={errors}
        onChange={(v) => setDraft((d) => ({ ...d, ...v }))}
        onBook={() => setPicker(true)}
        posting={publish.isPending}
        onPost={post}
        onBack={back}
      />
      <Sheet open={picker} onClose={() => setPicker(false)} title="Link a book">
        <BookPicker
          books={live.map((b) => ({ id: b.book_id, title: b.title }))}
          current={book?.book_id ?? null}
          onPick={(id) => {
            setDraft((d) => ({ ...d, book: id }));
            setPicker(false);
          }}
        />
      </Sheet>
    </Screen>
  );
}
