import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  Avatar,
  Btn,
  Count,
  Cover,
  EmptyState,
  IconButton,
  OnHero,
  Petals,
  Pill,
  Press,
  Skeleton,
  Tabs,
  Text,
  motion,
  useTheme,
  type AvatarTone,
  type CoverTone,
} from '@arpedia/ui';

// Flow 06 inbox pieces that mirror prototype elements one to one
// (`node tools/screen.mjs s-community s-dms s-community-groups --css`).

export type InboxTab = 'all' | 'unread' | 'groups';

/** `.hero` with `.hero__bar` (title, Reading rooms, Discover) and `.hero__tabs` (All, Unread, Groups). */
export function CommunityHero({
  tab,
  counts,
  onTab,
  onRooms,
  onDiscover,
}: {
  tab: InboxTab;
  counts: { all?: number; unread?: number };
  onTab: (t: InboxTab) => void;
  /** Absent while the reading_rooms flag is off (flow 16 rule 27). */
  onRooms?: () => void;
  onDiscover: () => void;
}) {
  const { c, s } = useTheme();
  return (
    <OnHero.Provider value>
      <View style={{ backgroundColor: c.org, overflow: 'hidden' }}>
        <Petals size={s(260)} style={{ right: s(-110), top: s(-90) }} />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(2),
            minHeight: s(52),
            paddingLeft: s(16),
            paddingRight: s(6),
          }}
        >
          <Text
            variant="display"
            size={30}
            color="onOrg"
            oneLine
            accessibilityRole="header"
            style={{ flex: 1, lineHeight: s(30) * 1.02 }}
          >
            Community
          </Text>
          {onRooms ? (
            <IconButton icon="book" label="Reading rooms" onPress={onRooms} color={c.onOrg} />
          ) : null}
          <IconButton icon="search" label="Discover communities" onPress={onDiscover} color={c.onOrg} />
        </View>
        <Tabs
          onBand
          active={tab}
          onChange={(k) => onTab(k as InboxTab)}
          tabs={[
            { key: 'all', label: 'All', count: counts.all || undefined },
            { key: 'unread', label: 'Unread', count: counts.unread || undefined },
            { key: 'groups', label: 'Groups' },
          ]}
        />
      </View>
    </OnHero.Provider>
  );
}

/** `.badge-auth`: 10px/700 on night, radius 5, padding 1 5. */
export function AuthorBadge() {
  const { c, s } = useTheme();
  return (
    <View
      style={{
        backgroundColor: c.night,
        borderRadius: s(5),
        paddingVertical: s(1),
        paddingHorizontal: s(5),
      }}
    >
      <Text size={10} weight={700} color={c.nightOn} oneLine style={{ lineHeight: s(10) * 1.45 }}>
        Author
      </Text>
    </View>
  );
}

export interface InboxRowView {
  id: string;
  name: string;
  tone: AvatarTone;
  avatarUrl?: string | null;
  /** One-to-one message: round avatar; groups are square (`.av.sq`). */
  person: boolean;
  live: boolean;
  author: boolean;
  sub: string;
  time: string;
  unread: number;
  muted: boolean;
}

/**
 * `.cell.cell--tap` in a flush group: avatar, `.com-row-name` (title + Live pill or Author badge),
 * one-line `.cell__sub`, and `.v4` trail (time over `.count`).
 */
export function InboxRowCell({
  row,
  divider,
  onPress,
}: {
  row: InboxRowView;
  divider: boolean;
  onPress: () => void;
}) {
  const { c, s, bw } = useTheme();
  return (
    <Press
      onPress={onPress}
      pressScale={motion.press.row}
      accessibilityLabel={`${row.name}, ${row.sub}${row.unread ? `, ${row.unread} unread` : ''}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        paddingVertical: s(12),
        paddingHorizontal: s(16),
        minHeight: s(56),
        ...(divider ? { borderTopWidth: bw(1), borderTopColor: c.line } : null),
      }}
    >
      <Avatar name={row.name} uri={row.avatarUrl ?? undefined} tone={row.tone} square={!row.person} />
      <View style={{ flex: 1, minWidth: 0, gap: s(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6), minWidth: 0 }}>
          <Text size={14.5} weight={600} ellipsis style={{ flexShrink: 1, lineHeight: s(14.5) * 1.3 }}>
            {row.name}
          </Text>
          {row.live ? <Pill label="Live" tone="night" /> : row.author ? <AuthorBadge /> : null}
        </View>
        <Text size={12.5} color="ink3" ellipsis style={{ lineHeight: s(12.5) * 1.35 }}>
          {row.sub}
        </Text>
      </View>
      {/* .cell__trail > .v4 (align-items: flex-end) */}
      <View style={{ gap: s(4), alignItems: 'flex-end' }}>
        <Text size={12} color="ink3" oneLine style={{ lineHeight: s(12) * 1.4 }}>
          {row.time}
        </Text>
        {row.unread > 0 ? (
          row.muted ? (
            // Muted groups: a quiet dot, not a number (rule 5)
            <View style={{ width: s(9), height: s(9), borderRadius: 999, backgroundColor: c.line }} />
          ) : (
            <Count value={row.unread} />
          )
        ) : null}
      </View>
    </Press>
  );
}

/** `.group.group--flush.pt8` of inbox rows. */
export function InboxList({ rows, onOpen }: { rows: InboxRowView[]; onOpen: (row: InboxRowView) => void }) {
  const { c, s } = useTheme();
  // Rows draw their own `.cell + .cell` divider (kit Group would add a second one around non-Cells).
  return (
    <View style={{ paddingTop: s(8) }}>
      <View style={{ backgroundColor: c.white }}>
        {rows.map((r, i) => (
          <InboxRowCell key={r.id} row={r} divider={i > 0} onPress={() => onOpen(r)} />
        ))}
      </View>
    </View>
  );
}

/** `.h8.inset.pt16`: "N conversations with new messages" and Mark all read (`.section__link`). */
export function UnreadBar({
  count,
  onMarkAll,
  busy,
}: {
  count: number;
  onMarkAll: () => void;
  busy?: boolean;
}) {
  const { s } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(8),
        paddingHorizontal: s(16),
        paddingTop: s(16),
      }}
    >
      <Text size={13.5} color="ink2" oneLine style={{ flex: 1, lineHeight: s(13.5) * 1.45 }}>
        {`${count} conversation${count === 1 ? '' : 's'} with new messages`}
      </Text>
      <Press onPress={onMarkAll} disabled={busy} hitSlop={12} pressScale={1} accessibilityRole="button">
        <Text size={13} weight={600} color="orgInk" oneLine>
          Mark all read
        </Text>
      </Press>
    </View>
  );
}

export interface RoomsSummary {
  people: { name: string; tone: AvatarTone }[];
  readingNow: number;
  books: { title: string; tone: CoverTone }[];
}

/** `.rt-card`: 16 padding, radius 18, 1px inset line (rooms: tinted, row with covers). */
function RtCard({
  rooms,
  onPress,
  children,
  label,
}: {
  rooms?: boolean;
  onPress: () => void;
  children: ReactNode;
  label: string;
}) {
  const { c, s } = useTheme();
  return (
    <Press
      onPress={onPress}
      pressScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        overflow: 'hidden',
        flexDirection: rooms ? 'row' : 'column',
        alignItems: rooms ? 'center' : 'stretch',
        gap: s(rooms ? 12 : 4),
        padding: s(16),
        borderRadius: s(18),
        backgroundColor: rooms ? c.orgTint2 : c.white,
        boxShadow: `inset 0 0 0 1px ${rooms ? `rgba(${c.orgRgb},0.22)` : c.line}`,
      }}
    >
      {children}
    </Press>
  );
}

function RtTitle({ children }: { children: string }) {
  const { s } = useTheme();
  return (
    <Text variant="h3" weight={700} oneLine style={{ lineHeight: s(18) * 1.45 }}>
      {children}
    </Text>
  );
}

function RtSub({ children }: { children: string }) {
  const { s } = useTheme();
  return (
    <Text size={13} color="ink2" style={{ lineHeight: s(13) * 1.35 }}>
      {children}
    </Text>
  );
}

const TAGS = ['Church', 'Campus', 'Lagos', 'Author circles', 'Read-alongs'];

/** `.rt`: "Read together" with the Reading rooms card and the Discover communities card. */
export function ReadTogether({
  rooms,
  onRooms,
  onDiscover,
}: {
  rooms?: RoomsSummary;
  /** Absent while the reading_rooms flag is off (flow 16 rule 27). */
  onRooms?: () => void;
  onDiscover: () => void;
}) {
  const { c, s } = useTheme();
  return (
    <View style={{ gap: s(10), paddingTop: s(20), paddingHorizontal: s(16), paddingBottom: s(16) }}>
      <Text
        variant="h3"
        oneLine
        accessibilityRole="header"
        style={{ marginHorizontal: s(2), marginBottom: s(2), lineHeight: s(18) * 1.45 }}
      >
        Read together
      </Text>
      {onRooms ? (
        <RtCard rooms onPress={onRooms} label="Reading rooms">
          <View style={{ flex: 1, minWidth: 0, gap: s(4) }}>
            <RtTitle>Reading rooms</RtTitle>
            <RtSub>One book, read chapter by chapter with friends</RtSub>
            {rooms && rooms.readingNow > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginTop: s(8) }}>
                <View style={{ flexDirection: 'row' }}>
                  {rooms.people.slice(0, 3).map((p, i) => (
                    // .rt-avs .av: 2px ring in the card tint, overlapping by 5
                    <View
                      key={p.name + i}
                      style={{
                        marginLeft: i ? -s(5) - s(2) * 2 : -s(2),
                        marginVertical: -s(2),
                        padding: s(2),
                        borderRadius: 999,
                        backgroundColor: c.orgTint2,
                      }}
                    >
                      <Avatar name={p.name} tone={p.tone} size="sm" />
                    </View>
                  ))}
                </View>
                <Text size={12} weight={600} color="ink2" oneLine style={{ flexShrink: 1 }}>
                  {`${rooms.readingNow} friend${rooms.readingNow === 1 ? '' : 's'} reading now`}
                </Text>
              </View>
            ) : null}
          </View>
          {rooms && rooms.books.length >= 2 ? (
            <View style={{ width: s(86), height: s(96) }}>
              {[rooms.books[0]!, rooms.books[1]!].map((b, i) => (
                <View
                  key={b.title + i}
                  style={{
                    position: 'absolute',
                    width: s(56),
                    ...(i === 0
                      ? { right: 0, top: s(2), transform: [{ rotate: '8deg' }], zIndex: 0 }
                      : { left: 0, top: s(10), transform: [{ rotate: '-6deg' }], zIndex: 1 }),
                  }}
                >
                  <Cover
                    title={b.title}
                    tone={b.tone}
                    size={48}
                    fluid
                    boxShadow="0 10px 18px -10px rgba(0,0,0,0.45)"
                  />
                </View>
              ))}
            </View>
          ) : null}
        </RtCard>
      ) : null}
      <RtCard onPress={onDiscover} label="Discover communities">
        <RtTitle>Discover communities</RtTitle>
        <RtSub>Find readers who love what you love</RtSub>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(6), marginTop: s(10) }}>
          {TAGS.map((t) => (
            <View
              key={t}
              style={{
                paddingVertical: s(6),
                paddingHorizontal: s(11),
                borderRadius: 999,
                backgroundColor: c.orgTint2,
                boxShadow: `inset 0 0 0 1px rgba(${c.orgRgb},0.18)`,
              }}
            >
              <Text size={12.5} weight={600} color="orgInk" oneLine>
                {t}
              </Text>
            </View>
          ))}
        </View>
      </RtCard>
    </View>
  );
}

/** Six skeleton rows while the inbox loads. */
export function InboxSkeleton() {
  const { c, s, bw } = useTheme();
  return (
    <View style={{ paddingTop: s(8) }}>
      {Array.from({ length: 6 }, (_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(12),
            paddingVertical: s(12),
            paddingHorizontal: s(16),
            minHeight: s(56),
            ...(i ? { borderTopWidth: bw(1), borderTopColor: c.line } : null),
          }}
        >
          <Skeleton width={s(36)} height={36} radius={14} />
          <View style={{ flex: 1, gap: s(6) }}>
            <Skeleton width="55%" height={13} />
            <Skeleton width="85%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Empty, caught-up and error states for the three filters. */
export function InboxEmpty({
  tab,
  onDiscover,
  onRooms,
}: {
  tab: InboxTab;
  onDiscover: () => void;
  /** Absent while the reading_rooms flag is off (flow 16 rule 27). */
  onRooms?: () => void;
}) {
  const { s } = useTheme();
  if (tab === 'unread') return <EmptyState title="You're all caught up." />;
  if (tab === 'groups')
    return (
      <EmptyState
        title="You haven't joined any groups yet."
        action={{ label: 'Discover', onPress: onDiscover }}
      />
    );
  return (
    <View>
      <EmptyState
        title="No conversations yet"
        body={onRooms ? 'Join a community or start a reading room' : 'Join a community to start talking'}
        action={{ label: 'Discover', onPress: onDiscover }}
      />
      {onRooms ? (
        <View style={{ alignItems: 'center', marginTop: -s(26) }}>
          <Btn label="Reading rooms" variant="g" size="md" onPress={onRooms} />
        </View>
      ) : null}
    </View>
  );
}

export function InboxError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      title="Couldn't load your conversations"
      body="Check your connection and try again."
      action={{ label: 'Try again', onPress: onRetry }}
    />
  );
}
