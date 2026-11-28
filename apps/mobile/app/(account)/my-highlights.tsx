import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, useToast } from '@arpedia/ui';
import { dateLabel } from '@arpedia/core';
import { queryClient } from '@/lib/query';
import { useTrack } from '../../features/10/analytics';
import { deleteAnnotation, restoreAnnotation, summaryKey, useCollection } from '../../features/10/data';
import { CollectionView, type CollectionKind, type CollectionPage } from '../../features/10/CollectionViews';

// Flow 10 · My highlights (s-my-highlights, rules 10–13). Cached pages keep it working offline.
const KINDS: CollectionKind[] = ['bookmark', 'highlight', 'note'];

export default function MyHighlights() {
  const toast = useToast();
  const track = useTrack();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [kind, setKind] = useState<CollectionKind>(
    KINDS.includes(params.tab as CollectionKind) ? (params.tab as CollectionKind) : 'highlight',
  );
  const [searching, setSearching] = useState(false);
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(typed.trim()), 250);
    return () => clearTimeout(t);
  }, [typed]);

  const list = useCollection(kind, query);
  const page = useMemo<CollectionPage | undefined>(() => {
    const pages = list.data?.pages;
    if (!pages?.length) return undefined;
    return { ...pages[0]!, groups: pages.flatMap((p) => p.groups), next: pages[pages.length - 1]!.next };
  }, [list.data]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['collection'] }),
      queryClient.invalidateQueries({ queryKey: summaryKey }),
    ]);

  const remove = (id: string, what: string, k: string) =>
    deleteAnnotation(id)
      .then(() => {
        track('annotation_deleted', { kind: k });
        void refresh();
        toast({
          message: `${what} deleted`,
          undoLabel: 'Undo',
          duration: 5000,
          onUndo: () =>
            void restoreAnnotation(id)
              .then(refresh)
              .catch(() => toast({ message: "Couldn't bring it back." })),
        });
      })
      .catch(() => toast({ message: "Couldn't delete it. Try again." }));

  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      // Next page when the reader nears the end.
    >
      <CollectionView
        kind={kind}
        page={page}
        error={list.isError}
        searching={searching}
        query={typed}
        dateLabel={(iso) => dateLabel(iso)}
        loadingMore={list.isFetchingNextPage}
        onBack={() => router.back()}
        onKind={(k) => setKind(k)}
        onSearch={() => {
          setSearching((v) => !v);
          setTyped('');
        }}
        onQuery={setTyped}
        onRetry={() => void list.refetch()}
        // Rule 11: the reader at that place. For a book not unlocked (a free-preview highlight, or one
        // removed from the library) the reader itself asks to unlock past the preview (rule 13).
        onOpen={(g, i) => {
          track('collection_item_opened', { kind: i.kind });
          router.push({ pathname: '/read/[id]', params: { id: g.book_id, cfi: i.cfi ?? undefined } });
        }}
        onItemMenu={(i) =>
          Alert.alert('Delete this?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () =>
                void remove(
                  i.id,
                  i.kind === 'bookmark' ? 'Bookmark' : i.kind === 'note' ? 'Note' : 'Highlight',
                  i.kind,
                ),
            },
          ])
        }
      />
      {page?.next && !list.isFetchingNextPage ? (
        <LoadMore key={page.next} onVisible={() => void list.fetchNextPage()} />
      ) : null}
    </Screen>
  );
}

/** Fetches the next page as soon as it mounts at the end of the list. */
function LoadMore({ onVisible }: { onVisible: () => void }) {
  const first = useRef(onVisible);
  useEffect(() => first.current(), []);
  return null;
}
