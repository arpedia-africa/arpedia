// Search (`s-search`, `s-search-typing`, `s-search-results`, `s-search-none`, `s-search-request`).
// Views take plain props so the parity pages can draw them with the prototype's sample data.
import { forwardRef, type ComponentRef, type ReactNode } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import {
  Avatar,
  Btn,
  Chip,
  Cover,
  Icon,
  IconButton,
  OnHero,
  Petals,
  Pill,
  Press,
  Text,
  androidFontSize,
  androidInputShift,
  fontFamily,
  motion,
  rgba,
  useTheme,
  type AvatarTone,
  type CoverTone,
  type IconName,
} from '@arpedia/ui';
import { normalizeQuery } from '@arpedia/core';

const n = (v: number) => v.toLocaleString('en-NG');

/* ─── Match highlighting ─────────────────────────────────────────────────── */
const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Splits text into runs, marking every word that starts with one of the query's words
 * (case and accents ignored): "A House Called Grace" + "gra" → […, {t: "Gra", hit}, {t: "ce"}].
 */
export function matchRuns(text: string, query: string): { t: string; hit: boolean }[] {
  const words = normalizeQuery(query).split(' ').filter(Boolean);
  if (!words.length) return [{ t: text, hit: false }];
  const out: { t: string; hit: boolean }[] = [];
  const push = (t: string, hit: boolean) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && last.hit === hit) last.t += t;
    else out.push({ t, hit });
  };
  // Tokens keep their separators so the text is rebuilt exactly.
  for (const tok of text.split(/(\s+|[^\p{L}\p{N}']+)/u)) {
    const f = fold(tok);
    const w = words.filter((x) => f.startsWith(x)).sort((a, b) => b.length - a.length)[0];
    if (w && /[\p{L}\p{N}]/u.test(tok)) {
      push(tok.slice(0, w.length), true);
      push(tok.slice(w.length), false);
    } else push(tok, false);
  }
  return out;
}

/** Text with matched runs drawn by `hit` (bold for suggestions, a yellow mark for results). */
function Marked({
  text,
  query,
  hit,
}: {
  text: string;
  query: string;
  hit: (t: string, i: number) => ReactNode;
}) {
  return <>{matchRuns(text, query).map((r, i) => (r.hit ? hit(r.t, i) : r.t))}</>;
}

/* ─── Search bar ─────────────────────────────────────────────────────────── */
export interface SearchBarProps {
  value: string;
  onChange?: (v: string) => void;
  onSubmit?: () => void;
  onBack?: () => void;
  onClear?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  focused: boolean;
  autoFocus?: boolean;
}

/** `.hero.sr-hero` + `.sr-bar`: back and the white search field with the focus ring. */
export const SearchBar = forwardRef<ComponentRef<typeof TextInput>, SearchBarProps>(function SearchBar(
  { value, onChange, onSubmit, onBack, onClear, onFocus, onBlur, focused, autoFocus },
  ref,
) {
  const { c, s, bw } = useTheme();
  const fs = s(14);
  const family = fontFamily('ui', 400);
  const shift = androidInputShift(fs, fs * 1.45, family);
  const placeholder = 'Books, authors, clubs';
  return (
    <OnHero.Provider value>
      <View style={{ backgroundColor: c.org, overflow: 'hidden' }}>
        {/* .sr-hero::after: right -130, top -120 */}
        <Petals size={s(260)} style={{ right: s(-130), top: s(-120) }} />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(4),
            paddingTop: s(6),
            paddingRight: s(16),
            paddingBottom: s(16),
            paddingLeft: s(6),
          }}
        >
          <IconButton icon="back" label="Back" color={c.onOrg} onPress={onBack} />
          <View style={{ flex: 1 }}>
            {/* focus ring: 0 0 0 4px rgba(74,38,0,.14) */}
            {focused ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  inset: -s(4),
                  borderRadius: s(18),
                  backgroundColor: 'rgba(74,38,0,0.14)',
                }}
              />
            ) : null}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: s(10),
                minHeight: s(52),
                borderRadius: s(14),
                paddingHorizontal: s(14),
                backgroundColor: c.white,
                borderWidth: bw(1.5),
                borderColor: focused ? c.onOrg : c.white,
                // 0 10px 24px -14px rgba(74,38,0,.55)
                shadowColor: '#4A2600',
                shadowOpacity: 0.55,
                shadowRadius: s(10),
                shadowOffset: { width: 0, height: s(10) },
                elevation: 3,
              }}
            >
              <Icon name="search" size="s" color={c.ink3} />
              <TextInput
                ref={ref}
                value={value}
                onChangeText={onChange}
                onSubmitEditing={onSubmit}
                onFocus={onFocus}
                onBlur={onBlur}
                autoFocus={autoFocus}
                placeholder={placeholder}
                placeholderTextColor="#6B7280"
                selectionColor={c.org}
                cursorColor={c.org}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
                maxLength={80}
                accessibilityLabel="Search"
                style={{
                  flex: 1,
                  minWidth: 0,
                  paddingTop: s(12) + shift,
                  paddingBottom: s(12) - shift,
                  paddingHorizontal: 0,
                  includeFontPadding: false,
                  fontFamily: family,
                  ...androidFontSize(fs, family, value || placeholder),
                  color: c.ink,
                }}
              />
              {value ? (
                <Press
                  onPress={onClear}
                  pressScale={motion.press.button}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  hitSlop={6}
                  style={{
                    width: s(32),
                    height: s(32),
                    marginRight: -s(6),
                    borderRadius: s(12),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="x" size="s" color={c.ink3} />
                </Press>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </OnHero.Provider>
  );
});

/* ─── Empty state ────────────────────────────────────────────────────────── */
/** `.sr-sec`: padding-top 20, head padding 0 16 10. */
export function SrSection({
  title,
  link,
  onLink,
  children,
}: {
  title: string;
  link?: string;
  onLink?: () => void;
  children: ReactNode;
}) {
  const { s } = useTheme();
  return (
    <View style={{ paddingTop: s(20) }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: s(12),
          paddingHorizontal: s(16),
          paddingBottom: s(10),
        }}
      >
        <Text variant="h3" oneLine style={{ flex: 1, lineHeight: s(18) * 1.45 }}>
          {title}
        </Text>
        {link ? (
          <Press onPress={onLink} hitSlop={12} accessibilityRole="link">
            <Text variant="label" color="orgInk" oneLine>
              {link}
            </Text>
          </Press>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export interface RecentItem {
  key: string;
  label: string;
}

/** `.sr-recent`: white chips with a 1px ring and a clock icon. */
export function RecentChips({ items, onPick }: { items: RecentItem[]; onPick?: (key: string) => void }) {
  const { c, s, bw } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(8), paddingHorizontal: s(16) }}>
      {items.map((r) => (
        <Press
          key={r.key}
          onPress={() => onPick?.(r.key)}
          pressScale={motion.press.button}
          accessibilityRole="button"
          accessibilityLabel={`Recent search ${r.label}`}
          style={{
            minHeight: s(36),
            maxWidth: '100%',
            paddingHorizontal: s(14) - bw(1),
            borderRadius: 999,
            borderWidth: bw(1),
            borderColor: c.line,
            backgroundColor: c.white,
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(6),
          }}
        >
          <Icon name="clock" size="xs" color={c.ink3} />
          <Text size={13} weight={600} color="ink2" ellipsis style={{ flexShrink: 1 }}>
            {r.label}
          </Text>
        </Press>
      ))}
    </View>
  );
}

export interface TrendingItem {
  query: string;
  /** "2.4k searches this week" on the first row, "1.9k" after. */
  count: string;
}

/** `.sr-trend`: rank, query, count; 1px rules between rows. */
export function TrendingList({ items, onPick }: { items: TrendingItem[]; onPick?: (i: number) => void }) {
  const { c, s, bw } = useTheme();
  return (
    <View style={{ paddingHorizontal: s(16) }}>
      {items.map((t, i) => (
        <Press
          key={t.query}
          onPress={() => onPick?.(i)}
          pressScale={motion.press.row}
          accessibilityRole="button"
          accessibilityLabel={`Trending search ${i + 1}, ${t.query}, ${t.count}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(14),
            paddingVertical: s(10),
            borderBottomWidth: i < items.length - 1 ? bw(1) : 0,
            borderBottomColor: c.line,
          }}
        >
          <Text
            family="display"
            weight={800}
            size={22}
            color="orgInk"
            tabular
            center
            oneLine
            style={{ minWidth: s(18), lineHeight: s(22) * 1.45 }}
          >
            {String(i + 1)}
          </Text>
          <Text size={15} weight={600} ellipsis style={{ flex: 1 }}>
            {t.query}
          </Text>
          <Text size={12.5} color="ink3" oneLine>
            {t.count}
          </Text>
        </Press>
      ))}
    </View>
  );
}

export interface SearchGenre {
  slug: string;
  name: string;
  count: number;
}

/** `.sr-genres`: two columns of colour tiles with a small petal ring at the bottom-right. */
export function SearchGenreGrid({
  genres,
  onPick,
}: {
  genres: SearchGenre[];
  onPick?: (slug: string) => void;
}) {
  const { c, s } = useTheme();
  // .sr-genre, .g2 … .g6: background, text, petal colour
  const looks: [string, string, string][] = [
    [c.orgTint, c.onOrg, 'rgba(255,255,255,0.55)'],
    [c.night, '#FFFFFF', rgba(c.orgRgb, 0.55)],
    ['#1F4D3F', '#FFFFFF', 'rgba(255,255,255,0.55)'],
    [c.org, c.onOrg, 'rgba(255,255,255,0.55)'],
    ['#8C2D4B', '#FFFFFF', 'rgba(255,255,255,0.55)'],
    [c.surface, c.ink, 'rgba(255,255,255,0.55)'],
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(10), paddingHorizontal: s(16) }}>
      {genres.map((g, i) => {
        const [bg, fg, petal] = looks[i % looks.length]!;
        return (
          <Press
            key={g.slug}
            onPress={() => onPick?.(g.slug)}
            pressScale={motion.press.cover}
            accessibilityRole="button"
            accessibilityLabel={`${g.name}, ${n(g.count)} books`}
            style={{
              flexBasis: '47%',
              flexGrow: 1,
              minHeight: s(84),
              borderRadius: s(16),
              padding: s(14),
              overflow: 'hidden',
              justifyContent: 'space-between',
              backgroundColor: bg,
            }}
          >
            <Petals
              size={s(96)}
              alpha={1}
              opacity={1}
              fill={petal}
              reverse={i % 2 === 1}
              style={{ right: s(-34), bottom: s(-34) }}
            />
            <Text
              family="display"
              weight={800}
              size={16}
              color={fg}
              oneLine
              style={{ lineHeight: s(16) * 1.1 }}
            >
              {g.name}
            </Text>
            <Text size={12} color={fg} oneLine style={{ opacity: 0.8 }}>
              {`${n(g.count)} ${g.count === 1 ? 'book' : 'books'}`}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

export interface PersonCard {
  id: string;
  name: string;
  tone: AvatarTone;
  uri?: string;
}

/** `.sr-people`: 60px avatars with the full name, scrolling sideways. */
export function PeopleRail({ people, onPick }: { people: PersonCard[]; onPick?: (id: string) => void }) {
  const { s } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: s(16), paddingHorizontal: s(16) }}
    >
      {people.map((p) => (
        <Press
          key={p.id}
          onPress={() => onPick?.(p.id)}
          pressScale={motion.press.cover}
          accessibilityRole="button"
          accessibilityLabel={p.name}
          style={{ width: s(72), alignItems: 'center', gap: s(6) }}
        >
          <Avatar name={p.name} uri={p.uri} size="person" tone={p.tone} />
          <Text size={12.5} weight={600} center numberOfLines={2} style={{ lineHeight: s(12.5) * 1.2 }}>
            {p.name}
          </Text>
        </Press>
      ))}
    </ScrollView>
  );
}

/* ─── Typing ─────────────────────────────────────────────────────────────── */
export type Suggestion =
  | { kind: 'all'; query: string }
  | { kind: 'book'; id: string; title: string; sub: string; tone: CoverTone; uri?: string }
  | { kind: 'person'; id: string; title: string; sub: string; tone: AvatarTone; uri?: string }
  | { kind: 'genre'; id: string; title: string; sub: string };

function SquareIcon({ name }: { name: IconName }) {
  const { c, s } = useTheme();
  return (
    <View
      style={{
        width: s(40),
        height: s(40),
        borderRadius: s(12),
        backgroundColor: c.orgTint,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={name} size="s" color={c.orgInk} />
    </View>
  );
}

/** `.sr-sugg`: the "Search for" row, then books, authors, clubs and genres with bold matches. */
export function SuggestionList({
  items,
  query,
  onPick,
}: {
  items: Suggestion[];
  query: string;
  onPick?: (s: Suggestion) => void;
}) {
  const { c, s } = useTheme();
  const bold = (t: string, i: number) => (
    <Text key={i} size={15} weight={800}>
      {t}
    </Text>
  );
  return (
    <View style={{ paddingVertical: s(6) }}>
      {items.map((it) => {
        const lead =
          it.kind === 'all' ? (
            <SquareIcon name="search" />
          ) : it.kind === 'genre' ? (
            <SquareIcon name="grid" />
          ) : it.kind === 'book' ? (
            <Cover title={it.title} author="" size={40} tone={it.tone} uri={it.uri} />
          ) : (
            <Avatar name={it.title} uri={it.uri} size="x40" tone={it.tone} />
          );
        const title =
          it.kind === 'all' ? (
            <>
              {'Search for “'}
              {bold(it.query, 0)}
              {'”'}
            </>
          ) : (
            <Marked text={it.title} query={query} hit={bold} />
          );
        const sub = it.kind === 'all' ? 'See all results' : it.sub;
        return (
          <Press
            key={it.kind === 'all' ? 'all' : `${it.kind}:${it.id}`}
            onPress={() => onPick?.(it)}
            pressScale={motion.press.row}
            accessibilityRole="button"
            accessibilityLabel={it.kind === 'all' ? `Search for ${it.query}` : `${it.title}, ${it.sub}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(12),
              paddingVertical: s(10),
              paddingHorizontal: s(16),
            }}
          >
            {lead}
            <View style={{ flex: 1, minWidth: 0, gap: s(1) }}>
              <Text size={15} weight={500} numberOfLines={1}>
                {title}
              </Text>
              <Text size={12.5} color="ink3" numberOfLines={1}>
                {sub}
              </Text>
            </View>
            {it.kind === 'all' ? (
              <View style={{ transform: [{ rotate: '-45deg' }] }}>
                <Icon name="arrow" size="s" color={c.ink3} />
              </View>
            ) : null}
          </Press>
        );
      })}
    </View>
  );
}

/** Offline note above library-only suggestions (rule 22). */
export function OfflineNote() {
  const { s } = useTheme();
  return (
    <Text size={12.5} color="ink3" style={{ paddingHorizontal: s(16), paddingTop: s(12) }}>
      Showing books in your library
    </Text>
  );
}

/* ─── Results ────────────────────────────────────────────────────────────── */
export type Scope = 'all' | 'books' | 'authors' | 'clubs';
export const SCOPES: { key: Scope; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'books', label: 'Books' },
  { key: 'authors', label: 'Authors' },
  { key: 'clubs', label: 'Clubs' },
];

/** `.sr-scope`: scope chips with counts and the filter button. */
export function ScopeRow({
  counts,
  scope,
  onScope,
  onFilter,
}: {
  counts: Record<Scope, number>;
  scope: Scope;
  onScope?: (s: Scope) => void;
  onFilter?: () => void;
}) {
  const { s } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(8),
        paddingTop: s(14),
        paddingHorizontal: s(16),
        paddingBottom: s(4),
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: s(8) }}
      >
        {SCOPES.map((x) => (
          <Chip
            key={x.key}
            label={`${x.label} ${n(counts[x.key])}`}
            state={scope === x.key ? 'on' : 'off'}
            onPress={() => onScope?.(x.key)}
          />
        ))}
      </ScrollView>
      <IconButton icon="filter" label="Filter results" onPress={onFilter} />
    </View>
  );
}

export interface TopResult {
  id: string;
  title: string;
  author: string;
  meta: string;
  credits: number;
  tone: CoverTone;
  uri?: string;
}

/** `.sr-top`: the best match with Read free preview and the unlock price. */
export function TopResultCard({
  book,
  query,
  onOpen,
  onPreview,
}: {
  book: TopResult;
  query: string;
  onOpen?: () => void;
  onPreview?: () => void;
}) {
  const { c, s, bw } = useTheme();
  const mark = (t: string, i: number) => (
    <Text key={i} family="display" weight={800} size={20} style={{ backgroundColor: c.hlY }}>
      {t}
    </Text>
  );
  return (
    <Press
      onPress={onOpen}
      pressScale={motion.press.row}
      accessibilityRole="button"
      accessibilityLabel={`Top result, ${book.title} by ${book.author}, ${book.meta}`}
      style={{
        marginTop: s(14),
        marginHorizontal: s(16),
        padding: s(16) - bw(1),
        borderRadius: s(18),
        borderWidth: bw(1),
        borderColor: c.orgTint,
        backgroundColor: c.orgTint2,
        flexDirection: 'row',
        gap: s(14),
      }}
    >
      <Cover
        title={book.title}
        author={book.author}
        size={88}
        tone={book.tone}
        uri={book.uri}
        boxShadow="0 12px 24px -12px rgba(0,0,0,0.55)"
      />
      <View style={{ flex: 1, minWidth: 0, gap: s(4) }}>
        <Text size={12} weight={700} color="orgInk" oneLine>
          Top result
        </Text>
        <Text
          family="display"
          weight={800}
          size={20}
          numberOfLines={2}
          style={{ lineHeight: s(20) * 1.1, letterSpacing: s(20) * -0.01 }}
        >
          <Marked text={book.title} query={query} hit={mark} />
        </Text>
        <Text size={14} weight={600} color="orgInk" ellipsis>
          {book.author}
        </Text>
        <Text size={12.5} color="ink2" oneLine>
          {book.meta}
        </Text>
        <View style={{ marginTop: 'auto', paddingTop: s(10), alignItems: 'flex-start', gap: s(6) }}>
          <Btn label="Read free preview" variant="p" size="sm" onPress={onPreview ?? onOpen} />
          <Text size={12.5} color="ink2" oneLine>
            {'or unlock for '}
            <Text size={12.5} weight={700}>
              {`${n(book.credits)} credits`}
            </Text>
          </Text>
        </View>
      </View>
    </Press>
  );
}

/** `.sr-head`: group title with its count. */
export function ResultHead({ title, count }: { title: string; count: number }) {
  const { s } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingTop: s(22),
        paddingHorizontal: s(16),
        paddingBottom: s(6),
      }}
    >
      <Text variant="h3" oneLine>
        {title}
      </Text>
      <Text size={13} color="ink3" tabular oneLine>
        {n(count)}
      </Text>
    </View>
  );
}

export type ResultItem =
  | {
      kind: 'book';
      id: string;
      title: string;
      author: string;
      snippet?: string | null;
      meta: string;
      credits: number;
      promoted?: boolean;
      tone: CoverTone;
      uri?: string;
    }
  | {
      kind: 'person' | 'club';
      id: string;
      title: string;
      meta: string;
      tone: AvatarTone;
      uri?: string;
      action: string;
    };

/** `.sr-list` of `.sr-row`s: books with the story snippet, authors with Follow, clubs with Join. */
export function ResultList({
  items,
  query,
  onOpen,
  onAction,
}: {
  items: ResultItem[];
  query: string;
  onOpen?: (it: ResultItem) => void;
  onAction?: (it: ResultItem) => void;
}) {
  const { c, s, bw } = useTheme();
  const mark = (size: number, weight: 400 | 700, family?: 'reading') =>
    function M(t: string, i: number) {
      return (
        <Text key={i} size={size} weight={weight} family={family} style={{ backgroundColor: c.hlY }}>
          {t}
        </Text>
      );
    };
  return (
    <View>
      {items.map((it, i) => (
        <Press
          key={`${it.kind}:${it.id}`}
          onPress={() => onOpen?.(it)}
          pressScale={motion.press.row}
          accessibilityRole="button"
          accessibilityLabel={
            it.kind === 'book' ? `${it.title} by ${it.author}, ${it.meta}` : `${it.title}, ${it.meta}`
          }
          style={{
            flexDirection: 'row',
            gap: s(12),
            paddingVertical: s(12),
            paddingHorizontal: s(16),
            borderBottomWidth: i < items.length - 1 ? bw(1) : 0,
            borderBottomColor: c.line,
          }}
        >
          {it.kind === 'book' ? (
            <Cover title={it.title} author={it.author} size={48} tone={it.tone} uri={it.uri} />
          ) : (
            <Avatar name={it.title} uri={it.uri} size="x48" tone={it.tone} />
          )}
          <View style={{ flex: 1, minWidth: 0, gap: s(2) }}>
            <Text size={15} weight={700} numberOfLines={2}>
              <Marked text={it.title} query={query} hit={mark(15, 700)} />
            </Text>
            {it.kind === 'book' ? (
              <>
                <Text size={13} weight={600} color="orgInk" ellipsis>
                  {it.author}
                </Text>
                {it.snippet ? (
                  <Text
                    family="reading"
                    size={13.5}
                    color="ink2"
                    numberOfLines={2}
                    style={{ lineHeight: s(13.5) * 1.45, marginTop: s(2) }}
                  >
                    <Marked text={it.snippet} query={query} hit={mark(13.5, 400, 'reading')} />
                  </Text>
                ) : null}
              </>
            ) : null}
            <Text size={12} color="ink3" numberOfLines={1}>
              {it.kind === 'book' && it.promoted ? `Promoted · ${it.meta}` : it.meta}
            </Text>
          </View>
          {it.kind === 'book' ? (
            <View style={{ alignSelf: 'center' }}>
              <Pill tone="grey" label={`${n(it.credits)} cr`} />
            </View>
          ) : (
            <Btn
              label={it.action}
              variant="s"
              size="sm"
              style={{ alignSelf: 'center' }}
              onPress={() => onAction?.(it)}
            />
          )}
        </Press>
      ))}
    </View>
  );
}

/* ─── No results ─────────────────────────────────────────────────────────── */
/** `.sr-none` + `.sr-tips`. */
export function NoResults({ query, onAsk, asking }: { query: string; onAsk?: () => void; asking?: boolean }) {
  const { c, s } = useTheme();
  const words = query.trim().split(/\s+/);
  const shorter = words.length > 2 ? words.slice(-2).join(' ') : null;
  return (
    <>
      <View style={{ paddingTop: s(28), paddingHorizontal: s(24), paddingBottom: s(8), gap: s(8) }}>
        <Text
          family="display"
          weight={800}
          size={24}
          accessibilityRole="header"
          textBreakStrategy="balanced"
          style={{ lineHeight: s(24) * 1.1, letterSpacing: s(24) * -0.02 }}
        >
          {`“${titleCase(query)}” isn’t on Arpedia yet`}
        </Text>
        <Text size={14.5} color="ink2" style={{ lineHeight: s(14.5) * 1.45 }}>
          We couldn’t find a book, author or club with those words. Ask for it and we’ll tell you if it
          arrives.
        </Text>
        <Btn
          label="Ask for this book"
          variant="p"
          onPress={onAsk}
          loading={asking}
          style={{ alignSelf: 'flex-start', marginTop: s(8) }}
        />
      </View>
      <View
        style={{
          marginTop: s(18),
          marginHorizontal: s(16),
          paddingVertical: s(14),
          paddingHorizontal: s(16),
          borderRadius: s(14),
          backgroundColor: c.surface,
          gap: s(6),
        }}
      >
        <Text size={13.5} weight={700}>
          Try
        </Text>
        <Text size={13.5} color="ink2" style={{ lineHeight: s(13.5) * 1.45 }}>
          Checking the spelling, or searching just the author’s name
        </Text>
        {shorter ? (
          <Text size={13.5} color="ink2" style={{ lineHeight: s(13.5) * 1.45 }}>
            {`Fewer words, like “${shorter}”`}
          </Text>
        ) : null}
      </View>
    </>
  );
}

/** "things fall apart" → "Things Fall Apart" (the reader's words, capitalised for the heading). */
export const titleCase = (q: string) =>
  q
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');

/** Body of `s-search-request` (the kit Sheet draws the bold head). */
export function RequestBody({
  name,
  count,
  query,
  onDone,
}: {
  name: string | null;
  count: number;
  query: string;
  onDone?: () => void;
}) {
  const { s } = useTheme();
  const others = count === 1 ? 'You’re the first reader to ask' : `${n(count)} readers have asked`;
  return (
    <>
      <Text size={15} style={{ lineHeight: s(15) * 1.5 }}>
        {`Thanks${name ? `, ${name}` : ''}. ${others} for “${titleCase(query)}”. We’ll send you a notification if it comes to Arpedia.`}
      </Text>
      <Btn label="Done" variant="p" block onPress={onDone} />
    </>
  );
}
