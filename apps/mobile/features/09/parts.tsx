import type { ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { PRIVACY_URL, TERMS_URL } from '@arpedia/core';
import { Icon, Pill, Press, Skeleton, Text, useBottomInset, useTheme, type PillTone } from '@arpedia/ui';

// Pieces shared by the four flow 09 screens, each mirroring a prototype class
// (`node tools/screen.mjs s-credits s-plans s-checkout s-plan-cancel --css`).

/** `.radio` off-ring in the prototype is a fixed #D1D5DB in every theme. */
const RADIO_OFF = '#D1D5DB';

/** `.option` (+ `.radio` for plans): radius 14, padding 14 16, min-height 56; selected = 2px main ring on tint 2. */
export function OptionRow({
  title,
  pill,
  sub,
  trail,
  selected,
  radio,
  onPress,
}: {
  title: string;
  pill?: { label: string; tone: PillTone };
  sub: string;
  trail: string;
  selected: boolean;
  /** Show the 22px radio (plans); top-up packs have none. */
  radio?: boolean;
  onPress: () => void;
}) {
  const { c, s, bw } = useTheme();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${sub}, ${trail}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        paddingVertical: s(14),
        paddingHorizontal: s(16),
        minHeight: s(56),
        borderRadius: s(14),
        backgroundColor: selected ? c.orgTint2 : c.white,
        borderWidth: selected ? 0 : bw(1),
        borderColor: c.line,
      }}
    >
      {selected ? (
        // box-shadow: inset 0 0 0 2px: takes no layout space
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: s(14),
            borderWidth: s(2),
            borderColor: c.org,
          }}
        />
      ) : null}
      {radio ? (
        <View
          style={{
            width: s(22),
            height: s(22),
            borderRadius: s(11),
            borderWidth: selected ? s(7) : s(2),
            borderColor: selected ? c.org : RADIO_OFF,
          }}
        />
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: s(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: s(8) }}>
          <Text size={15.5} weight={700} oneLine style={{ flexShrink: 1 }}>
            {title}
          </Text>
          {pill ? <Pill label={pill.label} tone={pill.tone} /> : null}
        </View>
        <Text size={13} color="ink2">
          {sub}
        </Text>
      </View>
      <Text size={16} weight={700} tabular oneLine>
        {trail}
      </Text>
    </Press>
  );
}

/** Skeleton for an `.option` row. */
export const OptionSkeleton = () => <Skeleton height={56} radius={14} />;

/** `.foot`: raised white footer with a 1px top rule, padding 12 16 26, gap 8. */
export function Foot({ children }: { children: ReactNode }) {
  const { c, s, bw } = useTheme();
  const bottom = useBottomInset(26);
  return (
    <View
      style={{
        paddingTop: s(12),
        paddingHorizontal: s(16),
        paddingBottom: bottom,
        gap: s(8),
        borderTopWidth: bw(1),
        borderTopColor: c.line,
        backgroundColor: c.white,
      }}
    >
      {children}
    </View>
  );
}

/** `.sub-pad.v16`: padding 22 20 24, gap 16. */
export function SubPad({ children }: { children: ReactNode }) {
  const { s } = useTheme();
  return (
    <View style={{ paddingTop: s(22), paddingHorizontal: s(20), paddingBottom: s(24), gap: s(16) }}>
      {children}
    </View>
  );
}

/** `.sub-legal` (12/1.5 centred, ink 3) and `.sub-links` (12.5, Terms and Privacy underlined). */
export function Legal({ children }: { children: string }) {
  const { s } = useTheme();
  return (
    <>
      <Text size={12} color="ink3" center style={{ lineHeight: s(12) * 1.5 }}>
        {children}
      </Text>
      <Text size={12.5} color="ink3" center>
        <Text
          size={12.5}
          weight={600}
          color="ink2"
          accessibilityRole="link"
          onPress={() => void Linking.openURL(TERMS_URL)}
          style={{ textDecorationLine: 'underline' }}
        >
          Terms of Service
        </Text>
        {' · '}
        <Text
          size={12.5}
          weight={600}
          color="ink2"
          accessibilityRole="link"
          onPress={() => void Linking.openURL(PRIVACY_URL)}
          style={{ textDecorationLine: 'underline' }}
        >
          Privacy Policy
        </Text>
      </Text>
    </>
  );
}

/** `.sub-benefits`: 14/600 lines with a 20px green tick disc (icon from the sprite). */
export function Benefits({ items }: { items: string[] }) {
  const { c, s } = useTheme();
  return (
    <View style={{ gap: s(10) }}>
      {items.map((t) => (
        <View key={t} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: s(10) }}>
          <View
            style={{
              width: s(20),
              height: s(20),
              marginTop: s(-1),
              borderRadius: s(10),
              backgroundColor: c.okT,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="check" size={14} color={c.ok} />
          </View>
          <Text size={14} weight={600} style={{ flex: 1, lineHeight: s(14) * 1.4 }}>
            {t}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Sentence under a disabled money button (States: Offline). */
export function OfflineNote() {
  return (
    <Text size={12} weight={500} color="ink3" center>
      Connect to the internet to continue
    </Text>
  );
}
