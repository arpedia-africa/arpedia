// Home (`s-home`): greeting band, shelves, the Top 10 band and Browse genres. Views take plain props
// so the parity page can draw them with the prototype's sample data.
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';
import {
  AppIcon,
  Avatar,
  Btn,
  Cover,
  EmptyState,
  Hero,
  Icon,
  IconButton,
  Petals,
  Pill,
  Press,
  Section,
  Skeleton,
  Text,
  Wordmark,
  fontFamily,
  motion,
  rgba,
  useTheme,
  type AvatarTone,
  type CoverTone,
} from '@arpedia/ui';

export interface BookCard {
  id: string;
  title: string;
  author: string;
  tone: CoverTone;
  uri?: string;
}
export interface RankCard extends BookCard {
  rank: number;
}
export interface AuthorCard {
  id: string;
  name: string;
  short: string;
  tone: AvatarTone;
  uri?: string;
}
export interface GenreCard {
  id: string;
  name: string;
  count: number;
}

const n = (v: number) => v.toLocaleString('en-NG');

/* ─── Greeting band ──────────────────────────────────────────────────────── */
export interface HomeHeroProps {
  greeting: string;
  credits: number | null;
  unread: number;
  onCredits?: () => void;
  onExplore?: () => void;
  onBell?: () => void;
  onSearch?: () => void;
}

/** `.hero` with the wordmark bar (credits pill, Explore, bell) and the search field. */
export function HomeHero({
  greeting,
  credits,
  unread,
  onCredits,
  onExplore,
  onBell,
  onSearch,
}: HomeHeroProps) {
  const { c, s } = useTheme();
  return (
    <Hero
      title={greeting}
      bar={
        <>
          {/* `.wm`: app icon + night wordmark, gap 6, takes the free space */}
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
            <AppIcon />
            <Wordmark night />
          </View>
          {credits != null ? (
            <Press
              onPress={onCredits}
              pressScale={motion.press.button}
              accessibilityRole="button"
              accessibilityLabel={`${n(credits)} credits`}
              hitSlop={{ top: 10, bottom: 10 }}
            >
              <Pill tone="night" iconName="coin" label={n(credits)} />
            </Press>
          ) : (
            <Skeleton width={s(62)} height={s(28)} radius={999} />
          )}
          <IconButton icon="grid" label="Explore" color={c.onOrg} onPress={onExplore} />
          <IconButton
            icon="bell"
            label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}
            color={c.onOrg}
            dot={unread > 0}
            onPress={onBell}
          />
        </>
      }
    >
      <Press
        onPress={onSearch}
        pressScale={motion.press.row}
        accessibilityRole="search"
        accessibilityLabel="Search books, authors, topics"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: s(10),
          backgroundColor: c.white,
          borderRadius: s(12),
          minHeight: s(48),
          paddingHorizontal: s(14),
        }}
      >
        <Icon name="search" color={c.ink3} />
        <Text size={14} color="ink3" oneLine style={{ flex: 1 }}>
          Search books, authors, topics
        </Text>
      </Press>
    </Hero>
  );
}

/* ─── Shelves ────────────────────────────────────────────────────────────── */
/** `.rail`: sideways shelf, gap 12, padding 0 16 6. */
export function Rail({ children, label }: { children: ReactNode; label: string }) {
  const { s } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      contentContainerStyle={{ gap: s(12), paddingHorizontal: s(16), paddingBottom: s(6) }}
    >
      {children}
    </ScrollView>
  );
}

/** `.bk.bk--author`: cover, title (two lines), author in the brand ink. */
export function BookTile({ book, onPress }: { book: BookCard; onPress?: () => void }) {
  const { s } = useTheme();
  return (
    <Press
      onPress={onPress}
      pressScale={motion.press.cover}
      accessibilityRole="button"
      accessibilityLabel={`${book.title} by ${book.author}`}
      style={{ width: s(104), gap: s(6) }}
    >
      <Cover title={book.title} author={book.author} size={104} tone={book.tone} uri={book.uri} />
      <Text size={13} weight={600} numberOfLines={2} style={{ lineHeight: s(13) * 1.25 }}>
        {book.title}
      </Text>
      <Text size={12} weight={600} color="orgInk" ellipsis>
        {book.author}
      </Text>
    </Press>
  );
}

/** `.avatar-tile`: 64px avatar and the short name. */
export function AuthorTile({ author, onPress }: { author: AuthorCard; onPress?: () => void }) {
  const { s } = useTheme();
  return (
    <Press
      onPress={onPress}
      pressScale={motion.press.cover}
      accessibilityRole="button"
      accessibilityLabel={author.name}
      style={{ width: s(72), alignItems: 'center', gap: s(6) }}
    >
      <Avatar name={author.name} uri={author.uri} size="tile" tone={author.tone} />
      <Text size={12} weight={600} center ellipsis style={{ lineHeight: s(12) * 1.2, alignSelf: 'stretch' }}>
        {author.short}
      </Text>
    </Press>
  );
}

/** `.band .rank`: big outlined rank number behind an 88px cover. */
export function RankTile({ book, onPress }: { book: RankCard; onPress?: () => void }) {
  const { c, s } = useTheme();
  const fs = s(96);
  const label = String(book.rank);
  // Bricolage 800 digits are about 0.6em wide; line-height .76 sets the box height.
  const w = Math.ceil(label.length * fs * 0.6 + s(3));
  const h = Math.round(fs * 0.76);
  return (
    <Press
      onPress={onPress}
      pressScale={motion.press.cover}
      accessibilityRole="button"
      accessibilityLabel={`Number ${book.rank}, ${book.title} by ${book.author}`}
      style={{ flexDirection: 'row', alignItems: 'flex-end' }}
    >
      <Svg width={w} height={h} style={{ marginRight: -s(6) }}>
        <SvgText
          x={s(1.5)}
          y={h * 0.97}
          fontFamily={fontFamily('display', 800, false, 96)}
          fontSize={fs}
          fill={c.org}
          stroke={c.night}
          strokeWidth={s(2.5)}
        >
          {label}
        </SvgText>
      </Svg>
      <Cover title={book.title} author={book.author} size={88} tone={book.tone} uri={book.uri} />
    </Press>
  );
}

/** `.band`: the Top 10 shelf on the main colour with petals at the bottom-left. */
export function Top10Band({
  title,
  books,
  onSeeAll,
  onBook,
}: {
  title: string;
  books: RankCard[];
  onSeeAll?: () => void;
  onBook?: (id: string) => void;
}) {
  const { c, s } = useTheme();
  return (
    <View
      style={{
        backgroundColor: c.org,
        overflow: 'hidden',
        marginTop: s(24),
        paddingTop: s(18),
        paddingBottom: s(22),
      }}
    >
      <Petals size={s(280)} style={{ left: s(-120), bottom: s(-140) }} />
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: s(12),
          paddingHorizontal: s(16),
          paddingBottom: s(12),
          marginBottom: s(12),
        }}
      >
        <View style={{ flex: 1, gap: s(2) }}>
          <Text variant="h3" color="onOrg" oneLine style={{ lineHeight: s(18) * 1.45 }}>
            {title}
          </Text>
          <Text size={12.5} color={rgba(c.onOrgRgb, 0.72)} oneLine>
            Most read on Arpedia this week
          </Text>
        </View>
        {onSeeAll ? (
          <Press onPress={onSeeAll} hitSlop={12} accessibilityRole="link">
            <Text variant="label" color="onOrg" oneLine>
              See all
            </Text>
          </Press>
        ) : null}
      </View>
      <Rail label={title}>
        {books.map((b) => (
          <RankTile key={b.id} book={b} onPress={() => onBook?.(b.id)} />
        ))}
      </Rail>
    </View>
  );
}

/* ─── Browse genres ──────────────────────────────────────────────────────── */
/** `.genre-grid`: two columns of tiles; the first is night, the fourth surface, the rest tint. */
export function GenreGrid({ genres, onGenre }: { genres: GenreCard[]; onGenre?: (id: string) => void }) {
  const { c, s } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(10), paddingHorizontal: s(16) }}>
      {genres.map((g, i) => {
        const look = i % 4 === 0 ? 'night' : i % 4 === 3 ? 'surface' : 'tint';
        const bg = look === 'night' ? c.night : look === 'surface' ? c.surface : c.orgTint;
        return (
          <Press
            key={g.id}
            onPress={() => onGenre?.(g.id)}
            pressScale={motion.press.cover}
            accessibilityRole="button"
            accessibilityLabel={`${g.name}, ${n(g.count)} books`}
            style={{
              // two columns: (100% − one 10px gap) ÷ 2
              flexBasis: '47%',
              flexGrow: 1,
              minHeight: s(76),
              borderRadius: s(14),
              padding: s(14),
              justifyContent: 'space-between',
              backgroundColor: bg,
            }}
          >
            <Text
              family="display"
              weight={800}
              size={16}
              color={look === 'night' ? '#FFFFFF' : c.night}
              oneLine
              style={{ lineHeight: s(16) * 1.1 }}
            >
              {g.name}
            </Text>
            <Text size={12} color={look === 'night' ? 'rgba(255,255,255,0.72)' : 'ink2'} oneLine>
              {`${n(g.count)} ${g.count === 1 ? 'book' : 'books'}`}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

/* ─── States ─────────────────────────────────────────────────────────────── */
/** Loading shelf: a title bar and four cover blocks (no spinners). */
export function ShelfSkeleton() {
  const { s } = useTheme();
  return (
    <View style={{ paddingTop: s(24) }}>
      <View style={{ paddingHorizontal: s(16), paddingBottom: s(12) }}>
        <Skeleton width={s(150)} height={s(20)} radius={s(6)} />
      </View>
      <View style={{ flexDirection: 'row', gap: s(12), paddingHorizontal: s(16), overflow: 'hidden' }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: s(104), gap: s(6) }}>
            <Skeleton width={s(104)} height={s(154)} radius={s(6)} />
            <Skeleton width={s(88)} height={s(13)} radius={s(4)} />
            <Skeleton width={s(64)} height={s(12)} radius={s(4)} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** A shelf that failed: inline message for that shelf only. */
export function ShelfError({ title, onRetry }: { title: string; onRetry: () => void }) {
  const { s } = useTheme();
  return (
    <Section title={title}>
      <View style={{ paddingHorizontal: s(16), flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
        <Text size={13.5} color="ink2" style={{ flex: 1 }}>
          {"Couldn't load. Try again."}
        </Text>
        <Btn label="Retry" variant="g" size="sm" onPress={onRetry} />
      </View>
    </Section>
  );
}

/** No live books yet. */
export function NoBooks() {
  return (
    <EmptyState
      title="Books are on their way"
      body="New books are being added. Check back soon, or meet the authors below."
    />
  );
}
