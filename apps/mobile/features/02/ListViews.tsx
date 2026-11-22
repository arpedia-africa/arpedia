// Top 10 (`s-see-all`), Explore (`s-explore`) and the genre filter sheet (`s-explore-filter`).
// Views take plain props so the parity pages can draw them with the prototype's sample data.
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import {
  Btn,
  Chip,
  Cover,
  EmptyState,
  Hero,
  Icon,
  IconButton,
  Pill,
  Press,
  Skeleton,
  Text,
  motion,
  useTheme,
  type CoverTone,
  type PillTone,
} from '@arpedia/ui';
import { movementLabel, type LengthBand, type Movement } from '@arpedia/core';

export interface ListBook {
  id: string;
  title: string;
  author: string;
  /** "Christian romance · 13 hr read" */
  meta: string;
  credits: number;
  tone: CoverTone;
  uri?: string;
}
export interface RankedBook extends ListBook {
  rank: number;
  move: Movement;
}
export interface GenreOption {
  /** null = All */
  slug: string | null;
  name: string;
  count: number;
}

const n = (v: number) => v.toLocaleString('en-NG');

/* ─── Hero ───────────────────────────────────────────────────────────────── */
/** `.hero` with `.hero__bar--back`: back, then optional trailing buttons. */
export function BackHero({
  title,
  sub,
  onBack,
  trail,
  children,
}: {
  title: string;
  sub?: string;
  onBack?: () => void;
  trail?: ReactNode;
  children?: ReactNode;
}) {
  const { c } = useTheme();
  return (
    <Hero
      barBack
      title={title}
      sub={sub}
      bar={
        <>
          <IconButton icon="back" label="Back" color={c.onOrg} onPress={onBack} />
          <View style={{ flex: 1 }} />
          {trail}
        </>
      }
    >
      {children}
    </Hero>
  );
}

/** `.search-row`: the white search link (opens Search) and the night filter button. */
export function SearchRow({ onSearch, onFilter }: { onSearch?: () => void; onFilter?: () => void }) {
  const { c, s } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: s(8) }}>
      <Press
        onPress={onSearch}
        pressScale={motion.press.row}
        accessibilityRole="search"
        accessibilityLabel="Search by title, author, genre"
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: s(10),
          backgroundColor: c.white,
          borderRadius: s(12),
          minHeight: s(48),
          paddingHorizontal: s(14),
        }}
      >
        <Icon name="search" size="s" color={c.ink3} />
        <Text size={14} color="ink3" oneLine style={{ flex: 1 }}>
          Title, author, genre
        </Text>
      </Press>
      <Press
        onPress={onFilter}
        pressScale={motion.press.button}
        accessibilityRole="button"
        accessibilityLabel="Filter by genre"
        style={{
          width: s(48),
          height: s(48),
          borderRadius: s(12),
          backgroundColor: c.night,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="filter" size="s" color="#FFFFFF" />
      </Press>
    </View>
  );
}

/* ─── Rows ───────────────────────────────────────────────────────────────── */
/** `.cell.cell--tap` in a flush group: [rank] cover, title, author (brand, bold), meta, trail. */
function BookCell({
  book,
  lead,
  trail,
  first,
  onPress,
  label,
}: {
  book: ListBook;
  lead?: ReactNode;
  trail: ReactNode;
  first: boolean;
  onPress?: () => void;
  label: string;
}) {
  const { c, s, bw } = useTheme();
  return (
    <Press
      onPress={onPress}
      pressScale={motion.press.row}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        paddingVertical: s(12),
        paddingHorizontal: s(16),
        minHeight: s(56),
        borderTopWidth: first ? 0 : bw(1),
        borderTopColor: c.line,
      }}
    >
      {lead}
      <Cover title={book.title} author={book.author} size={48} tone={book.tone} uri={book.uri} />
      <View style={{ flex: 1, minWidth: 0, gap: s(2) }}>
        <Text size={14.5} weight={600} ellipsis style={{ lineHeight: s(14.5) * 1.3 }}>
          {book.title}
        </Text>
        {/* `.cell__sub.t-brand.t-strong`: .cell__sub comes later in the prototype CSS, so it draws ink-3 bold. */}
        <Text size={12.5} weight={700} color="ink3" ellipsis style={{ lineHeight: s(12.5) * 1.35 }}>
          {book.author}
        </Text>
        <Text size={12.5} color="ink3" oneLine style={{ lineHeight: s(12.5) * 1.35 }}>
          {book.meta}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>{trail}</View>
    </Press>
  );
}

const MOVE_TONE: Record<Movement['kind'], PillTone> = { up: 'ok', new: 'ok', down: 'err', same: 'grey' };
const moveWords = (m: Movement) =>
  m.kind === 'up'
    ? `up ${m.by}`
    : m.kind === 'down'
      ? `down ${m.by}`
      : m.kind === 'same'
        ? 'same as last week'
        : 'new this week';

/** `.rank-n`: display 800, 26px, brand ink, centred in at least 22px. */
function RankNumber({ rank }: { rank: number }) {
  const { s } = useTheme();
  return (
    <Text
      family="display"
      weight={800}
      size={26}
      color="orgInk"
      tabular
      oneLine
      center
      style={{ minWidth: s(22), lineHeight: s(26) * 1.45 }}
    >
      {String(rank)}
    </Text>
  );
}

/** Top 10 list: rank, cover, title, author, "Genre · N hr read · N cr" and the movement pill. */
export function Top10List({ books, onBook }: { books: RankedBook[]; onBook?: (id: string) => void }) {
  return (
    <View>
      {books.map((b, i) => (
        <BookCell
          key={b.id}
          book={{ ...b, meta: `${b.meta} · ${n(b.credits)} cr` }}
          first={i === 0}
          lead={<RankNumber rank={b.rank} />}
          trail={<Pill tone={MOVE_TONE[b.move.kind]} label={movementLabel(b.move)} />}
          onPress={() => onBook?.(b.id)}
          label={`Number ${b.rank}, ${b.title} by ${b.author}, ${b.meta}, ${n(b.credits)} credits, ${moveWords(b.move)}`}
        />
      ))}
    </View>
  );
}

/** Explore list: cover, title, author, "Genre · N hr read", credit pill and chevron. */
export function CatalogueList({ books, onBook }: { books: ListBook[]; onBook?: (id: string) => void }) {
  const { c } = useTheme();
  return (
    <View>
      {books.map((b, i) => (
        <BookCell
          key={b.id}
          book={b}
          first={i === 0}
          trail={
            <>
              <Pill tone="grey" label={`${n(b.credits)} cr`} />
              <Icon name="chev" size="s" color={c.ink3} />
            </>
          }
          onPress={() => onBook?.(b.id)}
          label={`${b.title} by ${b.author}, ${b.meta}, ${n(b.credits)} credits`}
        />
      ))}
    </View>
  );
}

/** Loading rows: cover blocks and text bars, no spinners. */
export function RowsSkeleton({ rows = 6, rank }: { rows?: number; rank?: boolean }) {
  const { c, s, bw } = useTheme();
  return (
    <View accessibilityLabel="Loading books">
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(12),
            paddingVertical: s(12),
            paddingHorizontal: s(16),
            borderTopWidth: i ? bw(1) : 0,
            borderTopColor: c.line,
          }}
        >
          {rank ? <Skeleton width={s(22)} height={s(26)} radius={s(6)} /> : null}
          <Skeleton width={s(48)} height={s(72)} radius={s(6)} />
          <View style={{ flex: 1, gap: s(6) }}>
            <Skeleton width="70%" height={s(14)} radius={s(4)} />
            <Skeleton width="45%" height={s(12)} radius={s(4)} />
            <Skeleton width="55%" height={s(12)} radius={s(4)} />
          </View>
          <Skeleton width={s(52)} height={s(26)} radius={999} />
        </View>
      ))}
    </View>
  );
}

/** A list that failed to load. */
export function ListError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      title="Couldn't load books"
      body="Check your connection and try again."
      action={{ label: 'Try again', onPress: onRetry }}
    />
  );
}

/* ─── Explore ────────────────────────────────────────────────────────────── */
/** `.chips.pt16`: single-select genre chips that scroll sideways. */
export function GenreChips({
  genres,
  value,
  onChange,
}: {
  genres: GenreOption[];
  value: string | null;
  onChange?: (slug: string | null) => void;
}) {
  const { s } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: s(8), paddingHorizontal: s(16), paddingTop: s(16) }}
    >
      {genres.map((g) => (
        <Chip
          key={g.slug ?? 'all'}
          label={g.name}
          state={g.slug === value ? 'on' : 'off'}
          onPress={() => onChange?.(g.slug)}
        />
      ))}
    </ScrollView>
  );
}

export type SortKey = 'most_read' | 'newest' | 'price';
export const SORT_LABEL: Record<SortKey, string> = {
  most_read: 'Most read',
  newest: 'Newest',
  price: 'Price low to high',
};

/** `.section__head` of "Browse catalogue": count in brand bold, sort link with a down chevron. */
export function CatalogueHead({
  count,
  sort,
  onSort,
}: {
  count: number | null;
  sort: SortKey;
  onSort?: () => void;
}) {
  const { c, s } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: s(12),
        paddingHorizontal: s(16),
        paddingBottom: s(12),
      }}
    >
      <View style={{ flex: 1, gap: s(2) }}>
        <Text variant="h3" oneLine style={{ lineHeight: s(18) * 1.45 }}>
          Browse catalogue
        </Text>
        {count == null ? (
          <Skeleton width={s(56)} height={s(14)} radius={s(4)} />
        ) : (
          // `.section__sub.t-brand.t-strong`: .section__sub wins the cascade, so ink-3 bold.
          <Text size={12.5} weight={700} color="ink3" oneLine>
            {`${n(count)} ${count === 1 ? 'book' : 'books'}`}
          </Text>
        )}
      </View>
      <Press
        onPress={onSort}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`Sort: ${SORT_LABEL[sort]}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}
      >
        <Text variant="label" color="orgInk" oneLine>
          {SORT_LABEL[sort]}
        </Text>
        <Icon name="chevd" size="xs" color={c.orgInk} />
      </Press>
    </View>
  );
}

/* ─── Filter sheet ───────────────────────────────────────────────────────── */
/** `.option.option--compact`: radio, title, muted count. */
export function OptionRow({
  title,
  trail,
  selected,
  onPress,
}: {
  title: string;
  trail?: string;
  selected: boolean;
  onPress?: () => void;
}) {
  const { c, s, bw } = useTheme();
  // .is-selected: 2px inset ring on the tint (border transparent). The ring is drawn as a 2px border,
  // so the padding gives back the extra pixel to keep every row the same size as the CSS box.
  const border = selected ? s(2) : bw(1);
  return (
    <Press
      onPress={onPress}
      pressScale={motion.press.row}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={trail ? `${title}, ${trail}` : title}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        paddingVertical: s(12) + bw(1) - border,
        paddingHorizontal: s(14) + bw(1) - border,
        minHeight: s(48),
        borderRadius: s(14),
        borderWidth: border,
        borderColor: selected ? c.org : c.line,
        backgroundColor: selected ? c.orgTint2 : c.white,
      }}
    >
      <View
        style={{
          width: s(22),
          height: s(22),
          borderRadius: 999,
          borderWidth: selected ? s(7) : s(2),
          borderColor: selected ? c.org : c.control,
        }}
      />
      <Text size={15.5} weight={700} oneLine style={{ flex: 1, lineHeight: s(15.5) * 1.45 }}>
        {title}
      </Text>
      {trail ? (
        <Text size={16} weight={700} color="ink3" tabular oneLine style={{ lineHeight: s(16) * 1.45 }}>
          {trail}
        </Text>
      ) : null}
    </Press>
  );
}

export const BAND_CHIPS: { key: LengthBand; label: string }[] = [
  { key: 'short', label: 'Under 150 pages · up to 75 cr' },
  { key: 'medium', label: '150–300 pages · 75–150 cr' },
  { key: 'long', label: '300+ pages · 150 cr and up' },
];

/** Body of `s-explore-filter` (the kit Sheet draws grab, title and close). */
export function FilterBody({
  genres,
  genre,
  bands,
  count,
  onGenre,
  onBand,
  onReset,
  onShow,
}: {
  genres: GenreOption[];
  genre: string | null;
  bands: LengthBand[];
  /** null while the count is loading */
  count: number | null;
  onGenre?: (slug: string | null) => void;
  onBand?: (band: LengthBand) => void;
  onReset?: () => void;
  onShow?: () => void;
}) {
  const { s } = useTheme();
  const showLabel =
    count == null
      ? 'Show books'
      : count === 0
        ? 'No books match'
        : `Show ${n(count)} ${count === 1 ? 'book' : 'books'}`;
  return (
    <>
      <View accessibilityRole="radiogroup" style={{ gap: s(10) }}>
        {genres.map((g) => (
          <OptionRow
            key={g.slug ?? 'all'}
            title={g.name}
            trail={n(g.count)}
            selected={g.slug === genre}
            onPress={() => onGenre?.(g.slug)}
          />
        ))}
      </View>
      <View style={{ gap: s(8) }}>
        <Text size={13} weight={600} oneLine>
          Length
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(8) }}>
          {BAND_CHIPS.map((b) => (
            <Chip
              key={b.key}
              label={b.label}
              state={bands.includes(b.key) ? 'sel' : 'off'}
              onPress={() => onBand?.(b.key)}
            />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: s(8) }}>
        <Btn label="Reset" variant="g" block onPress={onReset} style={{ flex: 1 }} />
        <Btn
          label={showLabel}
          variant="p"
          block
          onPress={onShow}
          disabled={count === 0}
          loading={count == null}
          style={{ flex: 1 }}
        />
      </View>
    </>
  );
}
