import { TextInput, View } from 'react-native';
import {
  Avatar,
  Icon,
  IconButton,
  OnHero,
  Petals,
  Press,
  Skeleton,
  Text,
  fontFamily,
  motion,
  useTheme,
  type AvatarTone,
} from '@arpedia/ui';
import { MESSAGE_MAX } from '@arpedia/core';
import { AuthorBadge } from './InboxViews';

// Flow 06 chat pieces that mirror prototype elements one to one
// (`node tools/screen.mjs s-channel --css`).

/** `.com-head`: back, `.com-who` (square avatar with white ring, name, status line), info. */
export function ComHead({
  name,
  tone,
  avatarUrl,
  person,
  status,
  onBack,
  onInfo,
}: {
  name: string;
  tone: AvatarTone;
  avatarUrl?: string | null;
  person?: boolean;
  status: string;
  onBack: () => void;
  onInfo: () => void;
}) {
  const { c, s } = useTheme();
  return (
    <OnHero.Provider value>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: s(6),
          paddingTop: s(4),
          paddingHorizontal: s(6),
          paddingBottom: s(12),
          backgroundColor: c.org,
          overflow: 'hidden',
        }}
      >
        {/* ::after: 220px petal ring at right -90 / top -150, opacity .5 */}
        <Petals size={s(220)} opacity={0.5} style={{ right: s(-90), top: s(-150) }} />
        <IconButton icon="back" label="Back" onPress={onBack} color={c.onOrg} />
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
          <View
            style={{
              margin: -s(2),
              padding: s(2),
              borderRadius: person ? 999 : s(14) + s(2),
              backgroundColor: 'rgba(255,255,255,0.9)',
            }}
          >
            <Avatar name={name} uri={avatarUrl ?? undefined} tone={tone} square={!person} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text size={15.5} weight={800} color="onOrg" ellipsis accessibilityRole="header">
              {name}
            </Text>
            <Text size={12} color={`rgba(${c.onOrgRgb},0.72)`} ellipsis>
              {status}
            </Text>
          </View>
        </View>
        <IconButton icon="info" label="Club info" onPress={onInfo} color={c.onOrg} />
      </View>
    </OnHero.Provider>
  );
}

/** `.com-pin`: pinned weekly reading (tinted bar under the header). */
export function ComPin({
  title,
  note,
  onPress,
}: {
  title: string;
  note?: string | null;
  onPress: () => void;
}) {
  const { c, s, bw } = useTheme();
  return (
    <Press
      onPress={onPress}
      pressScale={1}
      accessibilityRole="button"
      accessibilityLabel={note ? `${title}. ${note}` : title}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(10),
        paddingVertical: s(10),
        paddingHorizontal: s(16),
        backgroundColor: c.orgTint2,
        borderBottomWidth: bw(1),
        borderBottomColor: c.line,
      }}
    >
      <Icon name="pin" size="s" color={c.orgInk} />
      <View style={{ flex: 1, minWidth: 0, gap: s(2) }}>
        <Text size={13.5} weight={700} ellipsis style={{ lineHeight: s(13.5) * 1.45 }}>
          {title}
        </Text>
        {note ? (
          <Text size={12} color="ink3" ellipsis style={{ lineHeight: s(12) * 1.4 }}>
            {note}
          </Text>
        ) : null}
      </View>
      <Icon name="chev" size="s" color={c.ink} />
    </Press>
  );
}

/** `.day`: centred grey pill (Today, Yesterday, Mon 9 Nov). */
export function DayMarker({ label }: { label: string }) {
  const { c, s } = useTheme();
  return (
    <View
      style={{
        alignSelf: 'center',
        backgroundColor: c.surface,
        borderRadius: 999,
        paddingVertical: s(4),
        paddingHorizontal: s(10),
      }}
    >
      <Text size={11.5} weight={600} color="ink2" oneLine>
        {label}
      </Text>
    </View>
  );
}

export interface BubbleView {
  key: string;
  me: boolean;
  senderName: string;
  senderTone: AvatarTone;
  senderAvatar?: string | null;
  author: boolean;
  /** One-to-one threads (s-dm) show no `.who` line. */
  hideName?: boolean;
  /** Body text; null for a deleted or removed message (shown in italics). */
  body: string | null;
  muted?: string;
  quote?: { text: string; source: string } | null;
  reply?: string | null;
  time: string;
  reactions?: string;
  /** "Not sent. Tap to retry" */
  failed?: string;
  sending?: boolean;
}

/** `.msg` (`.me` reversed, tinted): avatar, `.bub` with `.who`, quote card, text, `.tm`, `.reac`. */
export function Bubble({
  m,
  onLongPress,
  onRetry,
  onOpenQuote,
}: {
  m: BubbleView;
  onLongPress?: () => void;
  onRetry?: () => void;
  /** Quote card: Open goes to that page in the reader (flow 06 rule 19). */
  onOpenQuote?: () => void;
}) {
  const { c, s, bw } = useTheme();
  const r = s(16);
  const tail = s(4);
  return (
    <Press
      onLongPress={onLongPress}
      onPress={m.failed ? onRetry : undefined}
      delayLongPress={350}
      pressScale={motion.press.row}
      accessibilityLabel={`${m.me ? 'You' : m.senderName}: ${m.body ?? m.muted ?? ''}`}
      accessibilityHint={onLongPress ? 'Long press for message actions' : undefined}
      style={{
        flexDirection: m.me ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        gap: s(8),
        maxWidth: '86%',
        alignSelf: m.me ? 'flex-end' : 'flex-start',
      }}
    >
      {m.me ? null : (
        <Avatar name={m.senderName} uri={m.senderAvatar ?? undefined} tone={m.senderTone} size="sm" />
      )}
      <View
        style={{
          flexShrink: 1,
          backgroundColor: m.me ? c.orgTint : c.surface,
          borderTopLeftRadius: r,
          borderTopRightRadius: r,
          borderBottomLeftRadius: m.me ? r : tail,
          borderBottomRightRadius: m.me ? tail : r,
          paddingVertical: s(9),
          paddingHorizontal: s(12),
        }}
      >
        {m.me || m.hideName ? null : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6), marginBottom: s(2) }}>
            <Text
              size={12}
              weight={700}
              color="orgInk"
              ellipsis
              style={{ flexShrink: 1, lineHeight: s(14) * 1.4 }}
            >
              {m.senderName}
            </Text>
            {m.author ? <AuthorBadge /> : null}
          </View>
        )}
        {m.reply !== undefined && m.reply !== null ? (
          <Text
            size={12}
            color="ink3"
            ellipsis
            style={{ borderLeftWidth: s(2), borderLeftColor: c.line, paddingLeft: s(6), marginBottom: s(4) }}
          >
            {m.reply}
          </Text>
        ) : null}
        {m.quote ? (
          // .quote-bub: white card, inset 1px line, Literata italic 12.5, source in UI 11.5
          <Press
            onPress={onOpenQuote ?? (m.failed ? onRetry : undefined)}
            // The card takes the touch, so it passes the bubble's long press on.
            onLongPress={onLongPress}
            delayLongPress={350}
            accessibilityRole={onOpenQuote ? 'link' : undefined}
            accessibilityLabel={`${m.quote.text} ${m.quote.source}`}
            accessibilityHint={onOpenQuote ? 'Opens this page in the book' : undefined}
            style={{
              backgroundColor: c.white,
              borderRadius: s(10),
              paddingVertical: s(6),
              paddingHorizontal: s(8),
              marginBottom: s(6),
              borderWidth: bw(1),
              borderColor: c.line,
            }}
          >
            <Text size={12.5} family="reading" italic color="ink2" style={{ lineHeight: s(12.5) * 1.4 }}>
              {m.quote.text}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: s(8), marginTop: s(4) }}>
              <Text size={11.5} color="ink3" style={{ flexShrink: 1, lineHeight: s(11.5) * 1.4 }}>
                {m.quote.source}
              </Text>
              {onOpenQuote ? (
                <Text size={11.5} weight={600} color="orgInk" oneLine style={{ marginLeft: 'auto' }}>
                  Open
                </Text>
              ) : null}
            </View>
          </Press>
        ) : null}
        {m.body !== null ? (
          <Text size={14} style={{ lineHeight: s(14) * 1.4 }}>
            {m.body}
          </Text>
        ) : (
          <Text size={14} italic color="ink3" style={{ lineHeight: s(14) * 1.4 }}>
            {m.muted}
          </Text>
        )}
        <Text
          size={10.5}
          color={m.failed ? 'err' : 'ink3'}
          style={{ marginTop: s(3), textAlign: 'right', lineHeight: s(10.5) * 1.4 }}
        >
          {m.failed ?? (m.sending ? `${m.time} · Sending` : m.time)}
        </Text>
        {m.reactions ? (
          <View
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              gap: s(4),
              backgroundColor: c.white,
              borderWidth: bw(1),
              borderColor: c.line,
              borderRadius: 999,
              paddingVertical: s(1),
              paddingHorizontal: s(6),
              marginTop: s(4),
            }}
          >
            <Text size={11} oneLine style={{ lineHeight: s(11) * 1.4 }}>
              {m.reactions}
            </Text>
          </View>
        ) : null}
      </View>
    </Press>
  );
}

/** `.composer`: share-a-highlight button, round field, `.send`. */
export function Composer({
  value,
  onChange,
  onSend,
  onPlus,
  placeholder,
  bottom,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onPlus: () => void;
  placeholder: string;
  bottom: number;
}) {
  const { c, s, bw } = useTheme();
  const canSend = value.trim().length > 0 && value.trim().length <= MESSAGE_MAX;
  const family = fontFamily('ui', 400);
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
      <IconButton icon="plus" label="Share a highlight" onPress={onPlus} />
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
          placeholder={placeholder}
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
            fontFamily: family,
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

/** Composer replaced by one sentence naming why the user can't post (rule 14). */
export function ComposerNote({
  text,
  action,
  bottom,
}: {
  text: string;
  action?: { label: string; onPress: () => void };
  bottom: number;
}) {
  const { c, s, bw } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(10),
        paddingTop: s(14),
        paddingHorizontal: s(16),
        paddingBottom: bottom,
        borderTopWidth: bw(1),
        borderTopColor: c.line,
        backgroundColor: c.white,
      }}
    >
      <Text
        size={13.5}
        color="ink2"
        style={{ flex: 1, lineHeight: s(13.5) * 1.45 }}
        accessibilityLiveRegion="polite"
      >
        {text}
      </Text>
      {action ? (
        <Press onPress={action.onPress} hitSlop={12} pressScale={1} accessibilityRole="button">
          <Text size={13} weight={600} color="orgInk" oneLine>
            {action.label}
          </Text>
        </Press>
      ) : null}
    </View>
  );
}

/** Skeleton bubbles while history loads. */
export function ChatSkeleton() {
  const { s } = useTheme();
  return (
    <View style={{ gap: s(10), paddingVertical: s(14), paddingHorizontal: s(12) }}>
      {[62, 48, 70, 40].map((w, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            gap: s(8),
            alignItems: 'flex-end',
            alignSelf: i === 2 ? 'flex-end' : 'flex-start',
          }}
        >
          {i === 2 ? null : <Skeleton width={s(26)} height={26} radius={13} />}
          <Skeleton width={s(w * 3)} height={44} radius={16} />
        </View>
      ))}
    </View>
  );
}
