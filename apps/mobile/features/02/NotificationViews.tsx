// Notifications (`s-notifications`): band with the new count, Mark all read and category tabs,
// then New (tinted, dot) and Earlier. Views take plain props for the parity page.
import { View } from 'react-native';
import {
  Avatar,
  Cover,
  GroupLabel,
  IconButton,
  OnHero,
  Petals,
  Pill,
  Press,
  Skeleton,
  Tabs,
  Text,
  Unread,
  motion,
  useTheme,
  type AvatarTone,
  type CoverTone,
} from '@arpedia/ui';

export type NotifCategory = 'all' | 'books' | 'authors' | 'community';

export interface NotifRow {
  id: string;
  /** Bold lead sentence: "New in the library." */
  title: string;
  body: string;
  when: string;
  unread: boolean;
  lead:
    | { kind: 'book'; title: string; tone: CoverTone; uri?: string }
    | { kind: 'person'; name: string; tone: AvatarTone; uri?: string; square?: boolean }
    | { kind: 'none' };
}

/** `.hero` with back + settings, title, "N new" line with Mark all read, and `.hero__tabs`. */
export function NotificationsHero({
  unread,
  category,
  onCategory,
  onBack,
  onSettings,
  onMarkAll,
}: {
  unread: number;
  category: NotifCategory;
  onCategory?: (c: NotifCategory) => void;
  onBack?: () => void;
  onSettings?: () => void;
  onMarkAll?: () => void;
}) {
  const { c, s } = useTheme();
  const line = unread === 0 ? 'You’re all caught up' : `${unread} new since you last checked`;
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
            paddingLeft: s(6),
            paddingRight: s(6),
          }}
        >
          <IconButton icon="back" label="Back" color={c.onOrg} onPress={onBack} />
          <View style={{ flex: 1 }} />
          <IconButton icon="cog" label="Notification settings" color={c.onOrg} onPress={onSettings} />
        </View>
        <View style={{ paddingTop: s(4), paddingHorizontal: s(16), paddingBottom: s(20), gap: s(12) }}>
          <Text variant="display" size={30} color="onOrg" style={{ lineHeight: s(30) * 1.02 }}>
            Notifications
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: s(10),
            }}
          >
            <Text size={14.5} color="onOrg" oneLine style={{ flexShrink: 1, lineHeight: s(14.5) * 1.45 }}>
              {line}
            </Text>
            {unread > 0 ? (
              <Press
                onPress={onMarkAll}
                pressScale={motion.press.button}
                accessibilityRole="button"
                accessibilityLabel="Mark all read"
                hitSlop={{ top: 8, bottom: 8 }}
              >
                <Pill tone="night" iconName="check" label="Mark all read" />
              </Press>
            ) : null}
          </View>
        </View>
        <Tabs
          onBand
          active={category}
          onChange={(k) => onCategory?.(k as NotifCategory)}
          tabs={[
            { key: 'all', label: 'All', count: unread > 0 ? unread : undefined },
            { key: 'books', label: 'Books' },
            { key: 'authors', label: 'Authors' },
            { key: 'community', label: 'Community' },
          ]}
        />
      </View>
    </OnHero.Provider>
  );
}

/** `.cell.cell--tap.cell--top` (+ `.cell--hl` and `.unread` when new). */
function NotifCell({ row, first, onPress }: { row: NotifRow; first: boolean; onPress?: () => void }) {
  const { c, s, bw } = useTheme();
  const l = row.lead;
  return (
    <Press
      onPress={onPress}
      pressScale={motion.press.row}
      accessibilityRole="button"
      accessibilityLabel={`${row.unread ? 'New. ' : ''}${row.title} ${row.body} ${row.when}`}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: s(12),
        paddingVertical: s(12),
        paddingHorizontal: s(16),
        minHeight: s(56),
        backgroundColor: row.unread ? c.orgTint2 : 'transparent',
        borderTopWidth: first ? 0 : bw(1),
        borderTopColor: c.line,
      }}
    >
      {l.kind === 'book' ? (
        <Cover title={l.title} author="" size={40} tone={l.tone} uri={l.uri} />
      ) : l.kind === 'person' ? (
        <Avatar name={l.name} uri={l.uri} tone={l.tone} square={l.square} />
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: s(2) }}>
        <Text size={14.5} weight={500} style={{ lineHeight: s(14.5) * 1.3 }}>
          <Text size={14.5} weight={700} style={{ lineHeight: s(14.5) * 1.3 }}>
            {row.title}
          </Text>
          {` ${row.body}`}
        </Text>
        <Text size={12.5} color="ink3" oneLine style={{ lineHeight: s(12.5) * 1.35 }}>
          {row.when}
        </Text>
      </View>
      {/* `.cell--top`: the dot sits at the top of the row, like the lead. */}
      {row.unread ? <Unread /> : null}
    </Press>
  );
}

/** "New" and "Earlier" groups. */
export function NotificationFeed({ rows, onOpen }: { rows: NotifRow[]; onOpen?: (r: NotifRow) => void }) {
  const { s } = useTheme();
  const fresh = rows.filter((r) => r.unread);
  const earlier = rows.filter((r) => !r.unread);
  const group = (label: string, list: NotifRow[]) =>
    list.length ? (
      <View style={{ paddingTop: s(18) }}>
        <GroupLabel>{label}</GroupLabel>
        <View>
          {list.map((r, i) => (
            <NotifCell key={r.id} row={r} first={i === 0} onPress={() => onOpen?.(r)} />
          ))}
        </View>
      </View>
    ) : null;
  return (
    <>
      {group('New', fresh)}
      {group('Earlier', earlier)}
    </>
  );
}

/** Loading rows (no spinners). */
export function FeedSkeleton() {
  const { s } = useTheme();
  return (
    <View style={{ paddingTop: s(18), paddingHorizontal: s(16), gap: s(18) }} accessibilityLabel="Loading">
      <Skeleton width={s(40)} height={s(12)} radius={s(4)} />
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ flexDirection: 'row', gap: s(12) }}>
          <Skeleton width={s(40)} height={s(60)} radius={s(6)} />
          <View style={{ flex: 1, gap: s(6) }}>
            <Skeleton width="90%" height={s(14)} radius={s(4)} />
            <Skeleton width="60%" height={s(14)} radius={s(4)} />
            <Skeleton width={s(56)} height={s(12)} radius={s(4)} />
          </View>
        </View>
      ))}
    </View>
  );
}
