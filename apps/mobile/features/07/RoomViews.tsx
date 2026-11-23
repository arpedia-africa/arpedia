import { Image, ScrollView, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { MESSAGE_MAX } from '@arpedia/core';
import {
  Avatar,
  Btn,
  Cell,
  Cover,
  EmptyState,
  Group,
  Icon,
  IconButton,
  Meter,
  OnHero,
  Petals,
  Pill,
  Press,
  Skeleton,
  Text,
  avatarTones,
  fontFamily,
  motion,
  useTheme,
  type AvatarTone,
  type CoverTone,
} from '@arpedia/ui';

// Flow 07 room screen pieces that mirror prototype elements one to one
// (`node tools/screen.mjs s-room --css`).

export interface MemberChip {
  id: string;
  /** "You · 72%", "Kemi · done" */
  label: string;
  name: string;
  avatarUrl?: string | null;
  tone: AvatarTone;
  percent: number;
}

/** `.com-members .ring`: night progress on a 45% white track, accent inside (56px, 48px hole). */
function BandRing({ value, children }: { value: number; children: React.ReactNode }) {
  const { c, s } = useTheme();
  const d = s(56);
  const stroke = s(4);
  const r = (d - stroke) / 2;
  const len = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: d, height: d, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={d} height={d} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={d / 2} cy={d / 2} r={d / 2} fill="rgba(255,255,255,0.45)" />
        <Circle
          cx={d / 2}
          cy={d / 2}
          r={r}
          stroke={c.night}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${len} ${len}`}
          strokeDashoffset={len * (1 - pct)}
        />
        <Circle cx={d / 2} cy={d / 2} r={d / 2 - stroke} fill={c.acc} />
      </Svg>
      {children}
    </View>
  );
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter((p) => /^[\p{L}\p{N}]/u.test(p))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/** `.member`: ring around a 42px avatar over an 11.5/600 label in night, 62 wide. */
function MemberDot({ m }: { m: MemberChip }) {
  const { c, s } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={m.label.replace('·', ',')}
      style={{ width: s(62), alignItems: 'center', gap: s(4) }}
    >
      <BandRing value={m.percent / 100}>
        <View
          style={{
            width: s(42),
            height: s(42),
            borderRadius: 999,
            backgroundColor: avatarTones[m.tone],
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {m.avatarUrl ? (
            <Image source={{ uri: m.avatarUrl }} style={{ width: '100%', height: '100%' }} />
          ) : (
            <Text size={12} weight={700} color="#FFFFFF" oneLine>
              {initialsOf(m.name)}
            </Text>
          )}
        </View>
      </BandRing>
      <Text size={11.5} weight={600} color={c.night} center oneLine style={{ lineHeight: s(11.5) * 1.45 }}>
        {m.label}
      </Text>
    </View>
  );
}

/**
 * `.com-head.com-head--room`: back, `.com-who` (40px cover, name, "Book · code XXXX"), share, then
 * `.com-members` with everyone's progress on the band.
 */
export function RoomHead({
  name,
  book,
  code,
  tone,
  coverUrl,
  members,
  loading,
  largeLine,
  note,
  onBack,
  onShare,
}: {
  name: string;
  book: string;
  code: string;
  tone: CoverTone;
  coverUrl?: string;
  members: MemberChip[];
  loading?: boolean;
  /** Rooms over 100: "74 of 212 finished" replaces the per-person row. */
  largeLine?: string | null;
  /** "This book was taken down" or "Updated 10:42". */
  note?: string | null;
  onBack: () => void;
  onShare: () => void;
}) {
  const { c, s } = useTheme();
  return (
    <OnHero.Provider value>
      <View style={{ backgroundColor: c.org, overflow: 'hidden', paddingTop: s(4), paddingBottom: s(14) }}>
        <Petals size={s(220)} opacity={0.5} style={{ right: s(-90), top: s(-150) }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6), paddingHorizontal: s(6) }}>
          <IconButton icon="back" label="Back" onPress={onBack} color={c.onOrg} />
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
            <Cover title={book} size={40} tone={tone} uri={coverUrl} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text size={15.5} weight={800} color="onOrg" ellipsis accessibilityRole="header">
                {name}
              </Text>
              <Text size={12} color={`rgba(${c.onOrgRgb},0.72)`} ellipsis>
                {`${book} · code ${code}`}
              </Text>
            </View>
          </View>
          <IconButton icon="share" label="Invite" onPress={onShare} color={c.onOrg} />
        </View>
        {/* .com-head--room .com-members: padding 10 6 0, gap 6 */}
        {loading ? (
          <View style={{ flexDirection: 'row', gap: s(6), paddingTop: s(10), paddingHorizontal: s(6) }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} style={{ width: s(62), alignItems: 'center', gap: s(4) }}>
                <Skeleton width={s(56)} height={56} radius={28} />
                <Skeleton width={s(44)} height={11} />
              </View>
            ))}
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              gap: s(6),
              paddingTop: s(10),
              paddingHorizontal: s(6),
              alignItems: 'flex-start',
            }}
          >
            {members.map((m) => (
              <MemberDot key={m.id} m={m} />
            ))}
            {largeLine ? (
              <Text
                size={13}
                weight={600}
                color={c.night}
                style={{ alignSelf: 'center', paddingHorizontal: s(8) }}
                oneLine
              >
                {largeLine}
              </Text>
            ) : null}
          </ScrollView>
        )}
        {note ? (
          <Text size={12} weight={600} color={c.night} style={{ paddingTop: s(8), paddingHorizontal: s(16) }}>
            {note}
          </Text>
        ) : null}
      </View>
    </OnHero.Provider>
  );
}

export type RoomTab = 'chat' | 'annotations' | 'members';

/** `.tabs`: Chat, Annotations (lock while locked), "Members 8". Same look as the kit Tabs. */
export function RoomTabs({
  active,
  onChange,
  locked,
  members,
}: {
  active: RoomTab;
  onChange: (t: RoomTab) => void;
  locked: boolean;
  members: number;
}) {
  const { c, s, bw } = useTheme();
  const tabs: { key: RoomTab; label: string; lock?: boolean }[] = [
    { key: 'chat', label: 'Chat' },
    { key: 'annotations', label: 'Annotations', lock: locked },
    { key: 'members', label: `Members ${members}` },
  ];
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        gap: s(4),
        paddingHorizontal: s(12),
        borderBottomWidth: bw(1),
        borderBottomColor: c.line,
        backgroundColor: c.white,
      }}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Press
            key={t.key}
            pressScale={1}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.lock ? `${t.label}, locked` : t.label}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(4),
              paddingHorizontal: s(10),
              paddingVertical: s(12),
              minHeight: s(44),
            }}
          >
            <Text size={14} weight={600} color={on ? c.ink : c.ink3} oneLine>
              {t.label}
            </Text>
            {t.lock ? <Icon name="lock" size="s" color={on ? c.ink : c.ink3} /> : null}
            {on ? (
              <View
                style={{
                  position: 'absolute',
                  left: s(10),
                  right: s(10),
                  bottom: -1,
                  height: s(3),
                  borderTopLeftRadius: s(3),
                  borderTopRightRadius: s(3),
                  backgroundColor: c.org,
                }}
              />
            ) : null}
          </Press>
        );
      })}
    </View>
  );
}

/** A message from someone further into the book: avatar and `.pill.grey` "Spoiler from ch. 22 · tap to show". */
export function SpoilerBubble({
  name,
  avatarUrl,
  tone,
  chapter,
  time,
  onReveal,
}: {
  name: string;
  avatarUrl?: string | null;
  tone: AvatarTone;
  chapter: number;
  time: string;
  onReveal: () => void;
}) {
  const { c, s } = useTheme();
  const r = s(16);
  return (
    <Press
      onPress={onReveal}
      pressScale={motion.press.row}
      accessibilityRole="button"
      accessibilityLabel={`${name}: spoiler from chapter ${chapter}. Tap to show`}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: s(8),
        maxWidth: '86%',
        alignSelf: 'flex-start',
      }}
    >
      <Avatar name={name} uri={avatarUrl ?? undefined} tone={tone} size="sm" />
      <View
        style={{
          flexShrink: 1,
          backgroundColor: c.surface,
          borderTopLeftRadius: r,
          borderTopRightRadius: r,
          borderBottomRightRadius: r,
          borderBottomLeftRadius: s(4),
          paddingVertical: s(9),
          paddingHorizontal: s(12),
          gap: s(3),
        }}
      >
        <Text size={12} weight={700} color="orgInk" ellipsis style={{ lineHeight: s(14) * 1.4 }}>
          {name}
        </Text>
        <View style={{ alignSelf: 'flex-start' }}>
          <Pill label={`Spoiler from ch. ${chapter} · tap to show`} tone="grey" />
        </View>
        <Text size={10.5} color="ink3" style={{ textAlign: 'right', lineHeight: s(10.5) * 1.4 }}>
          {time}
        </Text>
      </View>
    </Press>
  );
}

/**
 * `.composer` of s-room: round field and `.send` (no share-a-highlight button: sharing to a room is
 * a toggle in the reader's highlight menu).
 */
export function RoomComposer({
  value,
  onChange,
  onSend,
  bottom,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  bottom: number;
}) {
  const { c, s, bw } = useTheme();
  const canSend = value.trim().length > 0 && value.trim().length <= MESSAGE_MAX;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(8),
        paddingTop: s(8),
        paddingHorizontal: s(10),
        paddingBottom: bottom,
        borderTopWidth: bw(1),
        borderTopColor: c.line,
        backgroundColor: c.white,
      }}
    >
      <View
        style={{
          flex: 1,
          minHeight: s(44),
          borderRadius: 999,
          backgroundColor: c.surface,
          borderWidth: bw(1.5),
          borderColor: c.surface,
          paddingHorizontal: s(14),
          justifyContent: 'center',
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="Message the room"
          placeholderTextColor={c.ink3}
          selectionColor={c.org}
          cursorColor={c.org}
          multiline
          maxLength={MESSAGE_MAX}
          accessibilityLabel="Message"
          style={{
            paddingVertical: s(10),
            paddingHorizontal: 0,
            includeFontPadding: false,
            fontFamily: fontFamily('ui', 400),
            fontSize: s(14),
            maxHeight: s(120),
            color: c.ink,
          }}
        />
      </View>
      <Press
        onPress={onSend}
        disabled={!canSend}
        pressScale={motion.press.icon}
        accessibilityRole="button"
        accessibilityLabel="Send"
        accessibilityState={{ disabled: !canSend }}
        style={{
          width: s(44),
          height: s(44),
          borderRadius: 999,
          backgroundColor: c.org,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="send" size="s" color={c.onOrg} />
      </Press>
    </View>
  );
}

/** One quiet line above the chat: "You are 2 chapters behind the room" (rule 22). */
export function NoteLine({ children }: { children: string }) {
  const { s } = useTheme();
  return (
    <Text size={12.5} color="ink2" center style={{ paddingTop: s(8), paddingHorizontal: s(16) }}>
      {children}
    </Text>
  );
}

// ─── Annotations tab ────────────────────────────────────────────────────────
export interface AnnotationView {
  id: string;
  name: string;
  quote: string | null;
  note: string | null;
  source: string | null;
}

export function AnnotationsLocked({
  book,
  percent,
  onContinue,
}: {
  book: string;
  percent: number;
  onContinue: () => void;
}) {
  return (
    <EmptyState
      title={`Finish ${book} to see everyone's highlights.`}
      body={`You are at ${Math.round(percent)}%.`}
      action={{ label: 'Continue reading', onPress: onContinue }}
    />
  );
}

export function AnnotationsList({ items }: { items: AnnotationView[] }) {
  const { c, s, bw } = useTheme();
  return (
    <View style={{ padding: s(16), gap: s(12) }}>
      {items.map((a) => (
        <View
          key={a.id}
          style={{
            gap: s(6),
            padding: s(14),
            borderRadius: s(14),
            borderWidth: bw(1),
            borderColor: c.line,
            backgroundColor: c.white,
          }}
        >
          <Text size={12.5} weight={700} color="orgInk" ellipsis>
            {a.name}
          </Text>
          {a.quote ? (
            <Text size={14} family="reading" italic color="ink2" style={{ lineHeight: s(14) * 1.5 }}>
              {`“${a.quote}”`}
            </Text>
          ) : null}
          {a.note ? (
            <Text size={14} style={{ lineHeight: s(14) * 1.45 }}>
              {a.note}
            </Text>
          ) : null}
          {a.source ? (
            <Text size={11.5} color="ink3" oneLine>
              {a.source}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ─── Members tab ────────────────────────────────────────────────────────────
export interface MemberRowView {
  id: string;
  name: string;
  avatarUrl?: string | null;
  tone: AvatarTone;
  host: boolean;
  me: boolean;
  percent: number;
  /** "Finished 3 Nov" when done. */
  finished: string | null;
  muted: boolean;
}

/** Avatar, name with the Host label, progress bar and percent (or "Finished 3 Nov"), and Mute for the host. */
export function MemberRow({
  m,
  divider,
  canMute,
  onMute,
}: {
  m: MemberRowView;
  divider: boolean;
  canMute: boolean;
  onMute: () => void;
}) {
  const { c, s, bw } = useTheme();
  return (
    <View
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
      <Avatar name={m.name} uri={m.avatarUrl ?? undefined} tone={m.tone} />
      <View style={{ flex: 1, minWidth: 0, gap: s(5) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
          <Text size={14.5} weight={600} ellipsis style={{ flexShrink: 1, lineHeight: s(14.5) * 1.3 }}>
            {m.me ? `${m.name} (you)` : m.name}
          </Text>
          {m.host ? <Pill label="Host" tone="brand" /> : null}
          {m.muted ? <Pill label="Muted" tone="grey" /> : null}
        </View>
        {m.finished ? (
          <Text size={12.5} color="ink3" oneLine>
            {m.finished}
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
            <Meter value={m.percent / 100} style={{ flex: 1 }} />
            <Text size={12} color="ink2" tabular oneLine style={{ minWidth: s(32), textAlign: 'right' }}>
              {`${Math.round(m.percent)}%`}
            </Text>
          </View>
        )}
      </View>
      {canMute && !m.host && !m.me ? (
        <Btn label={m.muted ? 'Unmute' : 'Mute'} variant="g" size="sm" onPress={onMute} />
      ) : null}
    </View>
  );
}

export function MembersSkeleton() {
  const { s } = useTheme();
  return (
    <View style={{ paddingTop: s(8) }}>
      {Array.from({ length: 5 }, (_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(12),
            paddingVertical: s(12),
            paddingHorizontal: s(16),
          }}
        >
          <Skeleton width={s(36)} height={36} radius={18} />
          <View style={{ flex: 1, gap: s(8) }}>
            <Skeleton width="45%" height={13} />
            <Skeleton width="80%" height={5} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Lock chat / End room (host) and Leave room (everyone), as plain rows. */
export function RoomActions({
  host,
  ended,
  locked,
  lockedByStaff,
  offline,
  onLock,
  onEnd,
  onLeave,
}: {
  host: boolean;
  ended: boolean;
  locked: boolean;
  lockedByStaff: boolean;
  offline: boolean;
  onLock: () => void;
  onEnd: () => void;
  onLeave: () => void;
}) {
  const { s } = useTheme();
  return (
    <View style={{ paddingTop: s(24), paddingBottom: s(28), gap: s(8) }}>
      <Group>
        {host && !ended && !lockedByStaff ? (
          <Cell title={locked ? 'Unlock chat' : 'Lock chat'} onPress={offline ? undefined : onLock} />
        ) : null}
        {host && !ended ? <Cell title="End room" danger onPress={offline ? undefined : onEnd} /> : null}
        <Cell title="Leave room" danger onPress={offline ? undefined : onLeave} />
      </Group>
      {offline ? (
        <Text size={12.5} color="ink3" center>
          Connect to do this
        </Text>
      ) : null}
    </View>
  );
}

/** Body of a confirm sheet: one plain sentence, the destructive action, Cancel. */
export function ConfirmBody({
  text,
  action,
  busy,
  onConfirm,
  onCancel,
}: {
  text: string;
  action: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { s } = useTheme();
  return (
    <>
      <Text size={15} color="ink2" style={{ lineHeight: s(15) * 1.45 }}>
        {text}
      </Text>
      <View style={{ gap: s(8) }}>
        <Btn label={action} variant="x" block loading={busy} onPress={onConfirm} />
        <Btn label="Cancel" variant="g" block disabled={busy} onPress={onCancel} />
      </View>
    </>
  );
}
