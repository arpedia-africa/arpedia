// Flow 05 Library, one to one with the prototype: s-library (grid), s-library-list, the Saved,
// Finished and Offline shelves. Pure views: the screen passes data and handlers, so the parity
// pages can draw them with the prototype's sample data.
import { ActivityIndicator, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import {
  Btn,
  Callout,
  Chip,
  Cover,
  EmptyState,
  Hero,
  Icon,
  Pill,
  Press,
  Skeleton,
  Text,
  fontFamily,
  motion,
  useTheme,
  type CoverTone,
} from '@arpedia/ui';

const n = (v: number) => v.toLocaleString('en-NG');

/* ─── Hero ───────────────────────────────────────────────────────────────── */
/** `.lib-toggle`: grid and list buttons on a translucent white track; the chosen one is night. */
function ViewToggle({ view, onView }: { view: 'grid' | 'list'; onView: (v: 'grid' | 'list') => void }) {
  const { c, s } = useTheme();
  const btn = (v: 'grid' | 'list', icon: 'grid' | 'rows', label: string) => {
    const on = view === v;
    return (
      <Press
        key={v}
        onPress={() => onView(v)}
        pressScale={motion.press.icon}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: on }}
        // 36px tiles inside a 3px track: the slop makes 44px targets.
        hitSlop={4}
        style={{
          width: s(36),
          height: s(36),
          borderRadius: s(9),
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: on ? c.night : 'transparent',
        }}
      >
        <Icon name={icon} size="s" color={on ? '#FFFFFF' : c.onOrg} />
      </Press>
    );
  };
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: s(2),
        backgroundColor: 'rgba(255,255,255,0.55)',
        borderRadius: s(12),
        padding: s(3),
      }}
    >
      {btn('grid', 'grid', 'Grid view')}
      {btn('list', 'rows', 'List view')}
    </View>
  );
}

/** `.search-row`: the white "Search your library" field (on-device, rule 9) and the night filter. */
function SearchRow({
  query,
  onQuery,
  onFilter,
}: {
  query: string;
  onQuery?: (q: string) => void;
  onFilter?: () => void;
}) {
  const { c, s } = useTheme();
  const family = fontFamily('ui', 400);
  return (
    <View style={{ flexDirection: 'row', gap: s(8) }}>
      <View
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
        <TextInput
          value={query}
          onChangeText={onQuery}
          editable={!!onQuery}
          placeholder="Search your library"
          placeholderTextColor={c.ink3}
          selectionColor={c.org}
          cursorColor={c.org}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          maxLength={80}
          accessibilityLabel="Search your library"
          style={{
            flex: 1,
            minWidth: 0,
            paddingVertical: 0,
            paddingHorizontal: 0,
            includeFontPadding: false,
            fontFamily: family,
            fontSize: s(14),
            color: c.ink,
          }}
        />
        {query ? (
          <Press
            onPress={() => onQuery?.('')}
            pressScale={motion.press.icon}
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
      <Press
        onPress={onFilter}
        pressScale={motion.press.button}
        accessibilityRole="button"
        accessibilityLabel="Filter library"
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

/** `.hero`: "Library" in the bar with the view toggle, then the search row. */
export function LibraryHero({
  view,
  onView,
  query,
  onQuery,
  onFilter,
}: {
  view: 'grid' | 'list';
  onView: (v: 'grid' | 'list') => void;
  query: string;
  onQuery?: (q: string) => void;
  onFilter?: () => void;
}) {
  const { s } = useTheme();
  return (
    <Hero
      bar={
        <>
          <Text
            variant="display"
            size={30}
            color="onOrg"
            oneLine
            accessibilityRole="header"
            style={{ flex: 1, lineHeight: s(30) * 1.02 }}
          >
            Library
          </Text>
          <ViewToggle view={view} onView={onView} />
        </>
      }
    >
      <SearchRow query={query} onQuery={onQuery} onFilter={onFilter} />
    </Hero>
  );
}

/* ─── Shelves ────────────────────────────────────────────────────────────── */
export type ShelfName = 'reading' | 'saved' | 'finished' | 'offline';
export const SHELF_LABEL: Record<ShelfName, string> = {
  reading: 'Reading',
  saved: 'Saved',
  finished: 'Finished',
  offline: 'Offline',
};
const SHELVES: ShelfName[] = ['reading', 'saved', 'finished', 'offline'];

/** `.chips.lib-shelves`: the four shelves with counts; a count still loading shows as a skeleton. */
export function ShelfChips({
  shelf,
  counts,
  onShelf,
}: {
  /** null while searching: no chip is selected. */
  shelf: ShelfName | null;
  counts: Record<ShelfName, number | null>;
  onShelf: (s: ShelfName) => void;
}) {
  const { s } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: s(8), paddingHorizontal: s(16), paddingTop: s(14) }}
    >
      {SHELVES.map((k) => {
        const count = counts[k];
        return (
          <Chip
            key={k}
            // Until the first count arrives the chip shows its name only (no "0" that isn't true).
            label={count == null ? SHELF_LABEL[k] : `${SHELF_LABEL[k]} ${n(count)}`}
            state={shelf === k ? 'on' : 'off'}
            onPress={() => onShelf(k)}
          />
        );
      })}
    </ScrollView>
  );
}

/** `.lib-shelves + .section__head`: shelf title and its soft line. */
export function ShelfHead({ title, sub }: { title: string; sub?: string }) {
  const { s } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: s(12),
        paddingHorizontal: s(16),
        paddingBottom: s(12),
        marginTop: s(20),
        marginBottom: s(12),
      }}
    >
      <Text
        variant="h3"
        oneLine
        accessibilityRole="header"
        style={{ flexShrink: 1, lineHeight: s(18) * 1.45 }}
      >
        {title}
      </Text>
      {sub ? (
        <Text size={13.5} color="ink2" oneLine style={{ lineHeight: s(13.5) * 1.45 }}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/* ─── Grid ───────────────────────────────────────────────────────────────── */
export interface GridBook {
  id: string;
  title: string;
  author: string;
  tone: CoverTone;
  /** Reading progress 0–100; null hides the badge and bar (rule 12). */
  percent: number | null;
  /** `.lib-state`: "Preview ended", "110 credits", "Out 4 December", "★ 5 · you rated" … */
  state?: string | null;
  /** Spinner on the cover (an expired book refreshing, rule 31). */
  busy?: boolean;
}

/** Three columns, 10px apart (`.lib-grid`). */
function useColumn() {
  const { s } = useTheme();
  const { width } = useWindowDimensions();
  return Math.floor(((width - s(32) - s(20)) / 3) * 100) / 100;
}

/** `.lib-book`: cover with ⋯, percent badge and progress bar; title, author, state line. */
function LibBook({
  b,
  width,
  onPress,
  onMore,
  onLongPress,
}: {
  b: GridBook;
  width: number;
  onPress: () => void;
  onMore: () => void;
  onLongPress?: () => void;
}) {
  const { s } = useTheme();
  const pct = b.percent == null ? null : Math.max(0, Math.min(100, Math.round(b.percent)));
  return (
    <Press
      onPress={onPress}
      onLongPress={onLongPress}
      pressScale={motion.press.cover}
      accessibilityLabel={[b.title, b.author, pct != null ? `${pct}%` : null, b.state]
        .filter(Boolean)
        .join(', ')}
      style={{ width, gap: s(6) }}
    >
      <View>
        <Cover title={b.title} author={b.author} tone={b.tone} fluid />
        <Press
          onPress={onMore}
          pressScale={motion.press.icon}
          accessibilityRole="button"
          accessibilityLabel={`More for ${b.title}`}
          // 26px dot: the slop makes a 44px target.
          hitSlop={9}
          style={{
            position: 'absolute',
            top: s(6),
            right: s(6),
            width: s(26),
            height: s(26),
            borderRadius: 999,
            backgroundColor: 'rgba(26,17,0,0.62)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="more" size="xs" color="#FFFFFF" />
        </Press>
        {pct != null ? (
          <>
            <View
              style={{
                position: 'absolute',
                right: s(6),
                bottom: s(12),
                backgroundColor: 'rgba(26,17,0,0.78)',
                borderRadius: 999,
                paddingVertical: s(2),
                paddingHorizontal: s(7),
              }}
            >
              <Text size={11} weight={700} color="#FFFFFF" tabular oneLine>
                {`${pct}%`}
              </Text>
            </View>
            <View
              style={{
                position: 'absolute',
                left: s(6),
                right: s(6),
                bottom: s(5),
                height: s(3),
                borderRadius: s(3),
                backgroundColor: 'rgba(255,255,255,0.4)',
                overflow: 'hidden',
              }}
            >
              <View style={{ width: `${pct}%`, height: '100%', backgroundColor: '#FFFFFF' }} />
            </View>
          </>
        ) : null}
        {b.busy ? (
          <View
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: s(6),
              backgroundColor: 'rgba(26,17,0,0.45)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      {/* A very long title wraps to two lines (edge cases); the author ellipsizes. */}
      <Text size={13} weight={600} numberOfLines={2} style={{ lineHeight: s(13) * 1.25 }}>
        {b.title}
      </Text>
      <Text size={12} weight={600} color="orgInk" ellipsis style={{ marginTop: -s(4) }}>
        {b.author}
      </Text>
      {b.state ? (
        <Text size={11.5} color="ink3" oneLine style={{ marginTop: -s(4) }}>
          {b.state}
        </Text>
      ) : null}
    </Press>
  );
}

export function LibGrid({
  books,
  onOpen,
  onMore,
  onLongPress,
}: {
  books: GridBook[];
  onOpen: (b: GridBook) => void;
  onMore: (b: GridBook) => void;
  onLongPress?: (b: GridBook) => void;
}) {
  const { s } = useTheme();
  const w = useColumn();
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        columnGap: s(10),
        rowGap: s(18),
        paddingTop: s(4),
        paddingHorizontal: s(16),
        paddingBottom: s(24),
      }}
    >
      {books.map((b) => (
        <LibBook
          key={b.id}
          b={b}
          width={w}
          onPress={() => onOpen(b)}
          onMore={() => onMore(b)}
          onLongPress={onLongPress ? () => onLongPress(b) : undefined}
        />
      ))}
    </View>
  );
}

/** Six cover tiles while the first page loads (States: Loading). */
export function GridSkeleton({ count = 6 }: { count?: number }) {
  const { s } = useTheme();
  const w = useColumn();
  return (
    <View
      accessibilityLabel="Loading your library"
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        columnGap: s(10),
        rowGap: s(18),
        paddingTop: s(4),
        paddingHorizontal: s(16),
        paddingBottom: s(24),
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: w, gap: s(6) }}>
          <Skeleton width={w} height={(w * 3) / 2} radius={s(6)} />
          <Skeleton width={w * 0.8} height={s(13)} radius={s(4)} />
          <Skeleton width={w * 0.6} height={s(11)} radius={s(4)} />
        </View>
      ))}
    </View>
  );
}

/* ─── List ───────────────────────────────────────────────────────────────── */
export interface RowBook {
  id: string;
  title: string;
  author: string;
  tone: CoverTone;
  /** "Chapter 7 of 14 · unlocked", "Pay as you read · Paid 132 of 184 credits", … */
  status: string;
  percent: number;
  /** "34% · 2 h 10 min left" / "10% read" */
  meta: string;
  offline?: boolean;
  /** "Pay the rest · 52" (pill) or "Unlock · 196 credits" (brand text). */
  action?: { kind: 'paygo' | 'unlock'; label: string; disabled?: boolean } | null;
}

/** `.cell.cell--tap.cell--top` in `.group--flush`: cover, title, author, status, bar, meta line. */
function LibRow({
  b,
  first,
  onPress,
  onAction,
}: {
  b: RowBook;
  first: boolean;
  onPress: () => void;
  onAction?: () => void;
}) {
  const { c, s, bw } = useTheme();
  const pct = Math.max(0, Math.min(100, b.percent));
  return (
    <Press
      onPress={onPress}
      pressScale={motion.press.row}
      accessibilityLabel={`${b.title}, ${b.author}, ${b.status}, ${b.meta}`}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: s(12),
        paddingVertical: s(12),
        paddingHorizontal: s(16),
        minHeight: s(56),
        ...(first ? null : { borderTopWidth: bw(1), borderTopColor: c.line }),
      }}
    >
      <Cover title={b.title} author={b.author} tone={b.tone} size={64} />
      <View style={{ flex: 1, minWidth: 0, gap: s(8) }}>
        <View style={{ gap: s(4) }}>
          <Text size={14.5} weight={600} numberOfLines={2} style={{ lineHeight: s(14.5) * 1.3 }}>
            {b.title}
          </Text>
          <Text size={12.5} weight={700} color="orgInk" ellipsis style={{ lineHeight: s(12.5) * 1.35 }}>
            {b.author}
          </Text>
          <Text size={12.5} color="ink3" oneLine style={{ lineHeight: s(12.5) * 1.35 }}>
            {b.status}
          </Text>
        </View>
        <View style={{ height: s(5), borderRadius: s(5), backgroundColor: c.surface, overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: '100%', borderRadius: s(5), backgroundColor: c.acc }} />
        </View>
        {/* Large text: the meta line wraps under the bar and the action moves below it. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: s(8) }}>
          <Text size={12} color="ink3" tabular oneLine style={{ lineHeight: s(12) * 1.4, flexShrink: 1 }}>
            {b.meta}
          </Text>
          <View style={{ flex: 1 }} />
          {b.offline ? <Pill tone="ok" label="Offline" /> : null}
          {b.action ? (
            <Press
              onPress={onAction}
              disabled={b.action.disabled}
              pressScale={motion.press.button}
              accessibilityRole="button"
              accessibilityLabel={b.action.label}
              accessibilityState={{ disabled: !!b.action.disabled }}
              hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
              style={
                b.action.kind === 'paygo'
                  ? {
                      paddingVertical: s(2),
                      paddingHorizontal: s(10),
                      borderRadius: 999,
                      backgroundColor: c.orgTint2,
                      borderWidth: bw(1),
                      borderColor: c.orgTint,
                      opacity: b.action.disabled ? 0.5 : 1,
                    }
                  : { opacity: b.action.disabled ? 0.5 : 1 }
              }
            >
              <Text size={12} weight={700} color="orgInk" tabular oneLine style={{ lineHeight: s(12) * 1.4 }}>
                {b.action.label}
              </Text>
            </Press>
          ) : null}
        </View>
      </View>
    </Press>
  );
}

export function LibList({
  rows,
  onOpen,
  onAction,
}: {
  rows: RowBook[];
  onOpen: (b: RowBook) => void;
  onAction: (b: RowBook) => void;
}) {
  const { s } = useTheme();
  return (
    <View style={{ paddingTop: s(8) }}>
      {rows.map((b, i) => (
        <LibRow key={b.id} b={b} first={i === 0} onPress={() => onOpen(b)} onAction={() => onAction(b)} />
      ))}
    </View>
  );
}

/** Six row skeletons (States: Loading). */
export function ListSkeleton({ count = 6 }: { count?: number }) {
  const { c, s, bw } = useTheme();
  return (
    <View accessibilityLabel="Loading your library" style={{ paddingTop: s(8) }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            gap: s(12),
            paddingVertical: s(12),
            paddingHorizontal: s(16),
            ...(i === 0 ? null : { borderTopWidth: bw(1), borderTopColor: c.line }),
          }}
        >
          <Skeleton width={s(64)} height={s(96)} radius={s(6)} />
          <View style={{ flex: 1, gap: s(8), paddingTop: s(2) }}>
            <Skeleton width="70%" height={s(14)} radius={s(4)} />
            <Skeleton width="45%" height={s(12)} radius={s(4)} />
            <Skeleton width="60%" height={s(12)} radius={s(4)} />
            <Skeleton height={s(5)} radius={s(5)} />
            <Skeleton width="40%" height={s(11)} radius={s(4)} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Footer skeleton while the next page loads (rule 35). */
export function PageSkeleton({ view }: { view: 'grid' | 'list' }) {
  return view === 'grid' ? <GridSkeleton count={3} /> : <ListSkeleton count={2} />;
}

/* ─── States ─────────────────────────────────────────────────────────────── */
/** `.callout.callout--info.inset-x.lib-link` (rule 28). */
export function OfflineNote() {
  const { s } = useTheme();
  return (
    <View style={{ marginHorizontal: s(16) }}>
      <Callout tone="info">
        Downloads last 7 days and refresh when you're back online with an active plan.
      </Callout>
    </View>
  );
}

/** Thin banner over cached content after a failed refresh (States: Error). */
export function RefreshBanner({ onRetry }: { onRetry: () => void }) {
  const { c, s } = useTheme();
  return (
    <Press
      onPress={onRetry}
      pressScale={motion.press.row}
      accessibilityRole="button"
      accessibilityLabel="Couldn't refresh. Pull to retry."
      style={{
        backgroundColor: c.surface,
        paddingVertical: s(8),
        paddingHorizontal: s(16),
        minHeight: s(44),
        justifyContent: 'center',
      }}
    >
      <Text size={12.5} color="ink2" oneLine center>
        Couldn't refresh. Pull to retry.
      </Text>
    </Press>
  );
}

/** An empty shelf: one sentence and at most two ways forward (no icons, DESIGN.md). */
export function ShelfEmpty({
  title,
  body,
  action,
  second,
}: {
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
  second?: { label: string; onPress: () => void };
}) {
  const { s } = useTheme();
  return (
    <View>
      <EmptyState title={title} body={body} action={action} />
      {second ? (
        <View style={{ alignItems: 'center', marginTop: -s(26), paddingBottom: s(28) }}>
          <Btn label={second.label} variant="g" size="md" onPress={second.onPress} />
        </View>
      ) : null}
    </View>
  );
}

/** Full retry state when nothing is cached yet (States: Error, no cache). */
export function LibraryError({ online, onRetry }: { online: boolean; onRetry: () => void }) {
  return (
    <EmptyState
      title="Your library didn't load"
      body={
        online ? 'Something went wrong on our side. Try again.' : "You're offline. Connect and try again."
      }
      action={{ label: 'Try again', onPress: onRetry }}
    />
  );
}
