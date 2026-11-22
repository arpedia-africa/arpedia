// Flow 10 · My highlights (s-my-highlights): Bookmarks, Highlights and Notes tabs, grouped by book.
import { View } from 'react-native';
import {
  Card,
  Cover,
  EmptyState,
  Field,
  Hero,
  IconButton,
  Press,
  Skeleton,
  Tabs,
  Text,
  covers,
  motion,
  useTheme,
  type CoverTone,
} from '@arpedia/ui';

export type CollectionKind = 'bookmark' | 'highlight' | 'note';

export interface CollectionItem {
  id: string;
  kind: CollectionKind;
  color: string | null;
  quote: string | null;
  note: string | null;
  cfi: string;
  chapter_ord: number | null;
  shared_group_id: string | null;
  /** Club name when shared (flow 06 fills it). */
  shared_to?: string | null;
  created_at: string;
}

export interface CollectionGroup {
  book_id: string;
  title: string;
  author: string;
  highlights: number;
  notes: number;
  owned: boolean;
  items: CollectionItem[];
}

export interface CollectionPage {
  groups: CollectionGroup[];
  next: string | null;
  items: number;
  books: number;
  counts: Record<CollectionKind, number>;
}

const TAB_LABEL: Record<CollectionKind, string> = {
  bookmark: 'Bookmarks',
  highlight: 'Highlights',
  note: 'Notes',
};
const NOUN: Record<CollectionKind, [string, string]> = {
  bookmark: ['bookmark', 'bookmarks'],
  highlight: ['highlight', 'highlights'],
  note: ['note', 'notes'],
};
const EMPTY: Record<CollectionKind, string> = {
  bookmark: 'No bookmarks yet. Tap the bookmark in the reader to save a page.',
  highlight: 'No highlights yet. Press and hold words in the reader to highlight them.',
  note: 'No notes yet. Highlight a line in the reader and add your thoughts.',
};

const plural = (n: number, [one, many]: [string, string]) =>
  `${n.toLocaleString('en-NG')} ${n === 1 ? one : many}`;

/** "86 highlights across 9 books". */
export const collectionSub = (kind: CollectionKind, items: number, books: number) =>
  `${plural(items, NOUN[kind])} across ${plural(books, ['book', 'books'])}`;

/** Highlight colours from the reader (flow 04) and their spoken names. */
const HL: Record<string, { token: 'hlY' | 'hlG' | 'hlB' | 'hlP'; name: string }> = {
  yellow: { token: 'hlY', name: 'Yellow' },
  green: { token: 'hlG', name: 'Green' },
  blue: { token: 'hlB', name: 'Blue' },
  pink: { token: 'hlP', name: 'Pink' },
  purple: { token: 'hlP', name: 'Purple' },
  peach: { token: 'hlY', name: 'Peach' },
};

const toneFor = (id: string) => {
  const keys = Object.keys(covers) as CoverTone[];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return keys[h % keys.length]!;
};

function Annotation({
  item,
  first,
  dateLabel,
  onOpen,
  onLongPress,
}: {
  item: CollectionItem;
  first: boolean;
  dateLabel: (iso: string) => string;
  onOpen: () => void;
  onLongPress: () => void;
}) {
  const { c, s, bw } = useTheme();
  const hl = item.color ? HL[item.color] : undefined;
  const meta = [
    item.chapter_ord !== null ? `Ch. ${item.chapter_ord + 1}` : null,
    dateLabel(item.created_at),
    item.shared_to ? `shared to ${item.shared_to}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Press
      onPress={onOpen}
      onLongPress={onLongPress}
      pressScale={motion.press.row}
      accessibilityRole="link"
      accessibilityHint="Opens the book at this place. Press and hold to delete."
      accessibilityLabel={`${hl ? `${hl.name} highlight. ` : ''}${item.quote ?? ''} ${item.note ?? ''} ${meta}`}
      style={{
        gap: s(6),
        ...(first ? null : { borderTopWidth: bw(1), borderTopColor: c.line, paddingTop: s(14) }),
      }}
    >
      <Text variant="xs" color="ink3" oneLine>
        {meta}
      </Text>
      {item.quote ? (
        <Text family="reading" size={15} style={{ lineHeight: s(15) * 1.5 }}>
          <Text family="reading" size={15} style={{ backgroundColor: hl ? c[hl.token] : undefined }}>
            {item.quote}
          </Text>
        </Text>
      ) : null}
      {item.note ? (
        <View
          style={{
            backgroundColor: c.surface,
            borderRadius: s(10),
            paddingVertical: s(8),
            paddingHorizontal: s(10),
          }}
        >
          <Text variant="sm">{item.note}</Text>
        </View>
      ) : null}
    </Press>
  );
}

function BookGroup({
  g,
  kind,
  dateLabel,
  onOpen,
  onItemMenu,
}: {
  g: CollectionGroup;
  kind: CollectionKind;
  dateLabel: (iso: string) => string;
  onOpen: (g: CollectionGroup, i: CollectionItem) => void;
  onItemMenu: (i: CollectionItem) => void;
}) {
  const { s } = useTheme();
  const counts =
    kind === 'bookmark'
      ? plural(g.items.length, NOUN.bookmark)
      : [
          g.highlights ? plural(g.highlights, NOUN.highlight) : null,
          g.notes ? plural(g.notes, NOUN.note) : null,
        ]
          .filter(Boolean)
          .join(' · ');
  return (
    <View style={{ gap: s(12) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
        <Cover title={g.title} author={g.author} size={40} tone={toneFor(g.book_id)} />
        <View style={{ flex: 1, minWidth: 0, gap: s(4) }}>
          <Text variant="title" ellipsis>
            {g.title}
          </Text>
          <Text variant="xs" color="ink3" oneLine>
            {counts}
          </Text>
        </View>
      </View>
      <Card style={{ gap: s(12) }}>
        {g.items.map((i, n) => (
          <Annotation
            key={i.id}
            item={i}
            first={n === 0}
            dateLabel={dateLabel}
            onOpen={() => onOpen(g, i)}
            onLongPress={() => onItemMenu(i)}
          />
        ))}
      </Card>
    </View>
  );
}

export interface CollectionViewProps {
  kind: CollectionKind;
  page?: CollectionPage;
  error?: boolean;
  searching: boolean;
  query: string;
  dateLabel: (iso: string) => string;
  loadingMore?: boolean;
  onBack: () => void;
  onKind: (k: CollectionKind) => void;
  onSearch: () => void;
  onQuery: (q: string) => void;
  onRetry: () => void;
  onOpen: (g: CollectionGroup, i: CollectionItem) => void;
  onItemMenu: (i: CollectionItem) => void;
}

export function CollectionView(p: CollectionViewProps) {
  const { c, s } = useTheme();
  const counts = p.page?.counts;
  return (
    <View>
      <Hero
        barBack
        bar={
          <>
            <IconButton icon="back" label="Back" onPress={p.onBack} color={c.onOrg} />
            <View style={{ flex: 1 }} />
            <IconButton
              icon={p.searching ? 'x' : 'search'}
              label={p.searching ? 'Close search' : `Search ${TAB_LABEL[p.kind].toLowerCase()}`}
              onPress={p.onSearch}
              color={c.onOrg}
            />
          </>
        }
        title="My highlights"
        sub={p.page ? collectionSub(p.kind, p.page.items, p.page.books) : ' '}
      >
        {/* .hero__tabs sit under the body: cancel its side and bottom padding */}
        <View style={{ marginHorizontal: s(-16), marginTop: s(8), marginBottom: s(-20) }}>
          <Tabs
            onBand
            active={p.kind}
            onChange={(k) => p.onKind(k as CollectionKind)}
            tabs={(['bookmark', 'highlight', 'note'] as const).map((k) => ({
              key: k,
              label: TAB_LABEL[k],
              count: counts?.[k],
            }))}
          />
        </View>
      </Hero>

      {p.searching ? (
        <View style={{ paddingHorizontal: s(16), paddingTop: s(16) }}>
          <Field
            icon="search"
            autoFocus
            placeholder={`Search your ${TAB_LABEL[p.kind].toLowerCase()}`}
            accessibilityLabel={`Search your ${TAB_LABEL[p.kind].toLowerCase()}`}
            value={p.query}
            onChangeText={p.onQuery}
            returnKeyType="search"
          />
        </View>
      ) : null}

      <View style={{ paddingHorizontal: s(16), paddingTop: s(16), paddingBottom: s(28), gap: s(24) }}>
        {p.error && !p.page ? (
          <Press
            onPress={p.onRetry}
            accessibilityRole="button"
            style={{ minHeight: s(44), justifyContent: 'center' }}
          >
            <Text variant="sm" color="ink2">
              {"Couldn't load your collection. "}
              <Text variant="sm" weight={600} color="orgInk">
                Try again
              </Text>
            </Text>
          </Press>
        ) : !p.page ? (
          [0, 1].map((i) => (
            <View key={i} style={{ gap: s(12) }}>
              <View style={{ flexDirection: 'row', gap: s(12), alignItems: 'center' }}>
                <Skeleton width={s(40)} height={60} radius={4} />
                <View style={{ flex: 1, gap: s(6) }}>
                  <Skeleton width="55%" height={15} />
                  <Skeleton width="30%" height={12} />
                </View>
              </View>
              <Skeleton height={88} radius={14} />
            </View>
          ))
        ) : p.page.groups.length === 0 ? (
          <EmptyState
            title={p.query ? 'Nothing matches' : `No ${TAB_LABEL[p.kind].toLowerCase()} yet`}
            body={
              p.query
                ? `Nothing in your ${TAB_LABEL[p.kind].toLowerCase()} matches "${p.query}".`
                : EMPTY[p.kind]
            }
          />
        ) : (
          p.page.groups.map((g) => (
            <BookGroup
              key={g.book_id}
              g={g}
              kind={p.kind}
              dateLabel={p.dateLabel}
              onOpen={p.onOpen}
              onItemMenu={p.onItemMenu}
            />
          ))
        )}
        {p.loadingMore ? <Skeleton height={88} radius={14} /> : null}
      </View>
    </View>
  );
}
