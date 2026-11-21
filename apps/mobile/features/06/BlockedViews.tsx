import { View } from 'react-native';
import { Avatar, Btn, Text, useTheme, type AvatarTone } from '@arpedia/ui';

// s-blocked rows that mirror prototype elements one to one (`node tools/screen.mjs s-blocked --css`).

/** `.group--flush .cell`: avatar, name, "Blocked 2 Nov · from Grace Readers", Unblock (`.btn-g.sm`). */
export function BlockedRow({
  name,
  tone,
  avatarUrl,
  sub,
  divider,
  onUnblock,
}: {
  name: string;
  tone: AvatarTone;
  avatarUrl?: string | null;
  sub: string;
  divider: boolean;
  onUnblock: () => void;
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
      <Avatar name={name} uri={avatarUrl ?? undefined} tone={tone} />
      <View style={{ flex: 1, minWidth: 0, gap: s(2) }}>
        <Text size={14.5} weight={600} ellipsis style={{ lineHeight: s(14.5) * 1.3 }}>
          {name}
        </Text>
        <Text size={12.5} color="ink3" style={{ lineHeight: s(12.5) * 1.35 }}>
          {sub}
        </Text>
      </View>
      <Btn label="Unblock" variant="g" size="sm" onPress={onUnblock} />
    </View>
  );
}
