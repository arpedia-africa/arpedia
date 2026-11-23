import { useState } from 'react';
import { View } from 'react-native';
import {
  Btn,
  Cover,
  EmptyState,
  Icon,
  IconButton,
  Hero,
  Press,
  Ring,
  Skeleton,
  Text,
  motion,
  useTheme,
  type CoverTone,
} from '@arpedia/ui';

// Flow 07 rooms list pieces that mirror prototype elements one to one
// (`node tools/screen.mjs s-rooms --css`).

/** `.hero` of s-rooms: back + title in the bar, promise, and `.com-rooms-cta` (Create room, Join with code). */
export function RoomsHero({
  onBack,
  onCreate,
  onJoin,
  offline,
}: {
  onBack: () => void;
  onCreate: () => void;
  onJoin: () => void;
  offline?: boolean;
}) {
  const { c, s } = useTheme();
  return (
    <Hero
      barBack
      bar={
        <>
          <IconButton icon="back" label="Back" onPress={onBack} color={c.onOrg} />
          <Text weight={700} color="onOrg" oneLine accessibilityRole="header" style={{ flex: 1 }}>
            Reading rooms
          </Text>
        </>
      }
      title="A book club that lives beside the page."
      sub="See everyone's progress, chat without losing your place, and unlock annotations when you finish."
    >
      {/* .com-rooms-cta: gap 8, wrap, margin-top 4 */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(8), marginTop: s(4) }}>
        <Btn label="Create room" icon="plus" variant="n" size="md" onPress={onCreate} disabled={offline} />
        <Btn label="Join with code" variant="g" size="md" onPress={onJoin} disabled={offline} />
      </View>
      {offline ? (
        <Text size={12} color="onOrg" style={{ opacity: 0.8 }}>
          Connect to do this
        </Text>
      ) : null}
    </Hero>
  );
}

/** `.section__head` with the count: "Your rooms  3". */
export function RoomsSectionHead({
  title,
  count,
  onPress,
  open,
}: {
  title: string;
  count: number;
  /** Makes the head a fold toggle (Finished rooms). */
  onPress?: () => void;
  open?: boolean;
}) {
  const { s } = useTheme();
  const body = (
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
      <Text variant="h3" oneLine style={{ flex: 1, lineHeight: s(18) * 1.45 }} accessibilityRole="header">
        {title}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
        <Text size={13.5} color="ink2" oneLine>
          {String(count)}
        </Text>
        {onPress ? (
          <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <Icon name="chevd" size="s" />
          </View>
        ) : null}
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Press
      onPress={onPress}
      pressScale={1}
      accessibilityRole="button"
      accessibilityState={{ expanded: !!open }}
      accessibilityLabel={`${title}, ${count}`}
      style={{ minHeight: s(44), justifyContent: 'center' }}
    >
      {body}
    </Press>
  );
}

export interface RoomRowView {
  id: string;
  name: string;
  book: string;
  tone: CoverTone;
  coverUrl?: string;
  /** "6 members · 3 finished" */
  members: string;
  /** "Active today" or "Starts Monday" */
  active: string;
  percent: number;
  unread: boolean;
}

/**
 * `.cell.cell--tap` in a flush group: 48px cover, `.cell__body.v2` (title, book, members line,
 * brand status) and the 44px `.ring` with the viewer's percent.
 */
export function RoomCell({
  row,
  divider,
  onPress,
}: {
  row: RoomRowView;
  divider: boolean;
  onPress: () => void;
}) {
  const { c, s, bw } = useTheme();
  const pct = Math.round(row.percent);
  return (
    <Press
      onPress={onPress}
      pressScale={motion.press.row}
      accessibilityLabel={`${row.name}, ${row.book}, ${row.members}, ${row.active}, you are at ${pct}%${row.unread ? ', unread messages' : ''}`}
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
      <Cover title={row.book} size={48} tone={row.tone} uri={row.coverUrl} />
      <View style={{ flex: 1, minWidth: 0, gap: s(2) }}>
        <Text size={14.5} weight={row.unread ? 700 : 600} ellipsis style={{ lineHeight: s(14.5) * 1.3 }}>
          {row.name}
        </Text>
        <Text size={12.5} color="ink3" ellipsis style={{ lineHeight: s(12.5) * 1.35 }}>
          {row.book}
        </Text>
        <Text size={12.5} color="ink3" oneLine style={{ lineHeight: s(12.5) * 1.35 }}>
          {row.members}
        </Text>
        <Text size={12} weight={700} color="orgInk" oneLine style={{ lineHeight: s(12) * 1.4 }}>
          {row.active}
        </Text>
      </View>
      <Ring value={row.percent / 100} size={44} inner={36}>
        <Text size={12} weight={700} tabular oneLine style={{ lineHeight: s(12) * 1.4 }}>
          {`${pct}%`}
        </Text>
      </Ring>
    </Press>
  );
}

/** A group of room cells, edge to edge. */
export function RoomList({ rows, onOpen }: { rows: RoomRowView[]; onOpen: (r: RoomRowView) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ backgroundColor: c.white }}>
      {rows.map((r, i) => (
        <RoomCell key={r.id} row={r} divider={i > 0} onPress={() => onOpen(r)} />
      ))}
    </View>
  );
}

/** "Finished rooms" folded list at the bottom (rule 3). */
export function FinishedRooms({ rows, onOpen }: { rows: RoomRowView[]; onOpen: (r: RoomRowView) => void }) {
  const [open, setOpen] = useState(false);
  const { s } = useTheme();
  if (!rows.length) return null;
  return (
    <View style={{ paddingTop: s(24) }}>
      <RoomsSectionHead
        title="Finished rooms"
        count={rows.length}
        open={open}
        onPress={() => setOpen((o) => !o)}
      />
      {open ? <RoomList rows={rows} onOpen={onOpen} /> : null}
    </View>
  );
}

/** Skeleton cards while the list loads. */
export function RoomsSkeleton() {
  const { c, s, bw } = useTheme();
  return (
    <View style={{ paddingTop: s(24) }}>
      <View style={{ paddingHorizontal: s(16), paddingBottom: s(12) }}>
        <Skeleton width="30%" height={18} />
      </View>
      {Array.from({ length: 3 }, (_, i) => (
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
          <Skeleton width={s(48)} height={72} radius={6} />
          <View style={{ flex: 1, gap: s(6) }}>
            <Skeleton width="60%" height={13} />
            <Skeleton width="45%" height={11} />
            <Skeleton width="55%" height={11} />
          </View>
          <Skeleton width={s(44)} height={44} radius={22} />
        </View>
      ))}
    </View>
  );
}

/** No rooms yet: "Read a book with friends" with both buttons (spec: Empty). */
export function RoomsEmpty({
  onCreate,
  onJoin,
  offline,
}: {
  onCreate: () => void;
  onJoin: () => void;
  offline?: boolean;
}) {
  const { s } = useTheme();
  return (
    <View>
      <EmptyState
        title="Read a book with friends"
        body="Make a room, share the code, and see how far everyone has read."
      />
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: s(8),
          marginTop: -s(26),
          paddingHorizontal: s(16),
        }}
      >
        <Btn label="Create room" size="md" onPress={onCreate} disabled={offline} />
        <Btn label="Join with code" variant="g" size="md" onPress={onJoin} disabled={offline} />
      </View>
      {offline ? (
        <Text size={12.5} color="ink3" center style={{ paddingTop: s(10) }}>
          Connect to do this
        </Text>
      ) : null}
    </View>
  );
}

export function RoomsError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      title="Couldn't load your rooms"
      body="Check your connection and try again."
      action={{ label: 'Try again', onPress: onRetry }}
    />
  );
}
