import { Image, TextInput, View } from 'react-native';
import { initials } from '@arpedia/core';
import {
  Avatar,
  Btn,
  Callout,
  Icon,
  IconButton,
  OnHero,
  Petals,
  Press,
  Text,
  avatarTones,
  fontFamily,
  rgba,
  useTheme,
  type AvatarTone,
} from '@arpedia/ui';

// s-dm. Pure views for app/(authors)/dm/[id].tsx (`node tools/screen.mjs s-dm --css`).
// Bubbles, day markers and the composer note come from flow 06 (features/06/ChatViews).

/** `.com-head` of a private thread: back, round avatar, name and "Private · Author · …", more. */
export function DmHead({
  name,
  tone,
  avatarUrl,
  status,
  onBack,
  onMore,
}: {
  name: string;
  tone: AvatarTone;
  avatarUrl?: string | null;
  status: string;
  onBack: () => void;
  onMore?: () => void;
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
        <Petals size={s(220)} opacity={0.5} style={{ right: s(-90), top: s(-150) }} />
        <IconButton icon="back" label="Back" onPress={onBack} color={c.onOrg} />
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
          <View
            style={{
              margin: -s(2),
              padding: s(2),
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.9)',
            }}
          >
            <Avatar name={name} uri={avatarUrl ?? undefined} tone={tone} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text size={15.5} weight={800} color="onOrg" ellipsis accessibilityRole="header">
              {name}
            </Text>
            <Text size={12} color={rgba(c.onOrgRgb, 0.72)} ellipsis>
              {status}
            </Text>
          </View>
        </View>
        {onMore ? (
          <IconButton icon="more" label="Report or block" onPress={onMore} color={c.onOrg} />
        ) : (
          <View style={{ width: s(44) }} />
        )}
      </View>
    </OnHero.Provider>
  );
}

/** `.com-intro .av`: 72px avatar, 24px initials (between the kit's lg and xl sizes). */
function IntroAvatar({ name, uri, tone }: { name: string; uri: string | null; tone: AvatarTone }) {
  const { s } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      style={{
        width: s(72),
        height: s(72),
        borderRadius: 999,
        backgroundColor: avatarTones[tone],
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Text size={24} weight={700} color="#FFFFFF" oneLine>
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

/** `.com-intro`: avatar, name, "Private chat · Author", View profile and the pinned cost notice. */
export function DmIntro({
  name,
  tone,
  avatarUrl,
  notice,
  onProfile,
}: {
  name: string;
  tone: AvatarTone;
  avatarUrl: string | null;
  notice: string;
  onProfile: () => void;
}) {
  const { s } = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: s(6),
        paddingTop: s(18),
        paddingHorizontal: s(20),
        paddingBottom: s(6),
      }}
    >
      <IntroAvatar name={name} uri={avatarUrl} tone={tone} />
      <Text size={16} weight={700} center ellipsis numberOfLines={1}>
        {name}
      </Text>
      <Text variant="xs" color="ink3" oneLine>
        Private chat · Author
      </Text>
      <Btn label="View profile" variant="g" size="sm" onPress={onProfile} />
      <View style={{ marginTop: s(8), width: '100%' }}>
        <Callout tone="quiet">
          <Text variant="xs" color="ink2">
            {notice}
          </Text>
        </Callout>
      </View>
    </View>
  );
}

/** `.composer` without the highlight button: round field, the price beside Send (rule 24), `.send`. */
export function DmComposer({
  value,
  onChange,
  onSend,
  price,
  max,
  sending,
  bottom,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  /** "5 credits" */
  price: string;
  max: number;
  sending: boolean;
  bottom: number;
}) {
  const { c, s, bw } = useTheme();
  const n = value.trim().length;
  const canSend = n > 0 && n <= max && !sending;
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
          placeholder="Write a private message…"
          placeholderTextColor={c.ink3}
          selectionColor={c.org}
          cursorColor={c.org}
          multiline
          maxLength={max}
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
      <Text variant="xs" weight={600} color="ink2" oneLine>
        {price}
      </Text>
      <Press
        onPress={onSend}
        disabled={!canSend}
        pressScale={0.9}
        accessibilityRole="button"
        accessibilityLabel={`Send for ${price}`}
        accessibilityState={{ disabled: !canSend, busy: sending }}
        style={{
          width: s(44),
          height: s(44),
          borderRadius: 999,
          backgroundColor: canSend ? c.org : c.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="send" size="s" color={canSend ? c.onOrg : c.ink3} />
      </Press>
    </View>
  );
}
