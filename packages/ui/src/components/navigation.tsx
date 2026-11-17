import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Icon, type IconName } from '../Icon';
import { ease } from '../motion';
import { Press } from '../Pressable';
import { Text } from '../Text';
import { useTheme } from '../theme';
import { motion, z } from '../tokens';
import { IconButton } from './actions';
import { useBottomInset } from './layout';

/* ─── Header (app bar) ───────────────────────────────────────────────────── */
export interface HeaderProps {
  title?: string;
  /** Show a back button; called when pressed. */
  onBack?: () => void;
  /** Close (×) instead of back. */
  close?: boolean;
  /** One action on the right (icon button or text button). */
  action?: ReactNode;
  border?: boolean;
  titleLeft?: boolean;
}

/** `.appbar`: back, centred title, one action. Every secondary screen. */
export function Header({ title, onBack, close, action, border, titleLeft }: HeaderProps) {
  const { c, s } = useTheme();
  const spacer = <View style={{ width: s(44) }} />;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(2),
        minHeight: s(52),
        paddingHorizontal: s(6),
        backgroundColor: c.white,
        zIndex: z.sticky,
        borderBottomWidth: border ? 1 : 0,
        borderBottomColor: c.line,
      }}
    >
      {onBack ? (
        <IconButton icon={close ? 'x' : 'back'} label={close ? 'Close' : 'Back'} onPress={onBack} />
      ) : titleLeft ? null : (
        spacer
      )}
      <Text
        size={16}
        weight={700}
        oneLine
        accessibilityRole="header"
        style={{ flex: 1, textAlign: titleLeft ? 'left' : 'center', paddingHorizontal: s(4) }}
      >
        {title ?? ''}
      </Text>
      {action ?? spacer}
    </View>
  );
}

/* ─── TabBar ─────────────────────────────────────────────────────────────── */
export interface TabItem {
  key: string;
  label: string;
  icon: IconName;
}

export const mainTabs: TabItem[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'library', label: 'Library', icon: 'lib' },
  { key: 'community', label: 'Community', icon: 'users' },
  { key: 'profile', label: 'Profile', icon: 'user' },
];

function TabIndicator({ on }: { on: boolean }) {
  const { c, s, reduceMotion } = useTheme();
  const k = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    // Select: the line grows from the centre; under reduced motion it just appears.
    k.value = on && reduceMotion ? 1 : 0;
    if (on && !reduceMotion) k.value = withTiming(1, { duration: motion.base, easing: ease });
  }, [on, k, reduceMotion]);
  const anim = useAnimatedStyle(() => ({ opacity: k.value > 0 ? 1 : 0, transform: [{ scaleX: k.value }] }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: -s(6),
          width: s(30),
          height: s(3),
          borderRadius: s(3),
          backgroundColor: c.org,
        },
        anim,
      ]}
    />
  );
}

export interface TabBarProps {
  tabs?: TabItem[];
  active: string;
  onChange: (key: string) => void;
}

/** `.tabbar`: four tabs; the active one is night with a main-colour line that grows from the centre. */
export function TabBar({ tabs = mainTabs, active, onChange }: TabBarProps) {
  const { c, s } = useTheme();
  const bottom = useBottomInset(22);
  return (
    <View
      accessibilityRole="tabbar"
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: c.line,
        paddingTop: s(6),
        paddingHorizontal: s(6),
        paddingBottom: bottom,
        backgroundColor: c.white,
        zIndex: z.tabbar,
      }}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        const col = on ? c.night : c.ink3;
        return (
          <Press
            key={t.key}
            onPress={() => onChange(t.key)}
            pressScale={motion.press.tab}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: on }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: s(3), minHeight: s(48) }}
          >
            <TabIndicator on={on} />
            <Icon name={t.icon} color={col} />
            <Text size={11} weight={600} color={col} oneLine>
              {t.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

/* ─── Tabs (underlined, inside a screen) ─────────────────────────────────── */
export interface TabsProps {
  /** `count` renders the prototype's `.count` pill after the label. */
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  onChange: (key: string) => void;
  /** On a hero band: faded on-org text with a night underline (`.hero__tabs`). */
  onBand?: boolean;
}

export function Tabs({ tabs, active, onChange, onBand }: TabsProps) {
  const { c, s } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        gap: s(4),
        paddingHorizontal: s(onBand ? 6 : 12),
        borderBottomWidth: onBand ? 0 : 1,
        borderBottomColor: c.line,
      }}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        const col = onBand ? (on ? c.onOrg : `rgba(${c.onOrgRgb},0.62)`) : on ? c.ink : c.ink3;
        return (
          <Press
            key={t.key}
            pressScale={1}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(onBand ? 6 : 4),
              paddingHorizontal: s(10),
              paddingTop: s(12),
              paddingBottom: s(onBand ? 14 : 12),
            }}
          >
            <Text size={14} weight={600} color={col} oneLine>
              {t.label}
            </Text>
            {t.count !== undefined ? (
              // .count: 22px pill, padding 0 7, accent fill, 11.5px 700
              <View
                style={{
                  minWidth: s(22),
                  height: s(22),
                  paddingHorizontal: s(7),
                  borderRadius: 999,
                  backgroundColor: c.acc,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text size={11.5} weight={700} color="accOn" oneLine>
                  {String(t.count)}
                </Text>
              </View>
            ) : null}
            {on ? (
              <View
                style={{
                  position: 'absolute',
                  left: s(10),
                  right: s(10),
                  bottom: onBand ? 0 : -1,
                  height: s(3),
                  borderTopLeftRadius: s(3),
                  borderTopRightRadius: s(3),
                  backgroundColor: onBand ? c.night : c.org,
                }}
              />
            ) : null}
          </Press>
        );
      })}
    </View>
  );
}
