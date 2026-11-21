import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen, Sheet, useToast } from '@arpedia/ui';
import { useSession } from '../../../features/01/session';
import { STUDIO } from '../../../features/11/application';
import { compact, useStudioBooks, useStudioHome } from '../../../features/11/studio';
import { BookPicker, StudioPostView, type StudioPostValues } from '../../../features/11/StudioCommsViews';

type Errors = Partial<Record<keyof StudioPostValues | 'form', string>>;
interface Draft extends StudioPostValues {
  book: string | null;
}

/**
 * s-studio-post: text post to followers and the author's club, optional link to one live book
 * (rule 31). Posts, fan-out and moderation are flow 08's; until it lands the draft is kept on the
 * phone and Post says so.
 */
export default function StudioPost() {
  const toast = useToast();
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

  const back = () => (router.canGoBack() ? router.back() : router.replace(STUDIO));

  const post = () => {
    const next: Errors = {};
    if (!draft.title.trim()) next.title = 'Add a title.';
    if (draft.body.trim().length < 2) next.body = 'Write something for your readers.';
    setErrors(next);
    if (Object.keys(next).length) return;
    toast({ message: 'Posting opens with author pages soon. Your draft is saved on this phone.' });
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
