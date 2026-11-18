import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Modal, Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../Icon';
import { ease } from '../motion';
import { Press } from '../Pressable';
import { Text } from '../Text';
import { useTheme } from '../theme';
import { motion, rgba, z } from '../tokens';
import { IconButton } from './actions';

/* ─── Sheet ──────────────────────────────────────────────────────────────── */
export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Block backdrop and back-button dismissal (while a spend is in flight). */
  locked?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
}

/** Bottom sheet that glides up; backdrop fades. Reduced motion: fade only. */
export function Sheet({ open, onClose, title, locked, children, footer }: SheetProps) {
  const { c, s, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(open);
  const t = useSharedValue(0);
  const [h, setH] = useState(600);

  useEffect(() => {
    if (open) {
      setMounted(true);
      t.value = withTiming(1, { duration: reduceMotion ? motion.base : motion.slow, easing: ease });
    } else if (mounted) {
      t.value = withTiming(0, { duration: motion.base, easing: ease }, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
    }
  }, [open, mounted, reduceMotion, t]);

  const backdrop = useAnimatedStyle(() => ({ opacity: Math.min(1, t.value * 1.6) }));
  const panel = useAnimatedStyle(() =>
    reduceMotion ? { opacity: t.value } : { transform: [{ translateY: (1 - t.value) * h }] },
  );
  const dismiss = () => {
    if (!locked) onClose();
  };

  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={dismiss}
      animationType="none"
    >
      <Animated.View
        style={[
          { position: 'absolute', inset: 0, backgroundColor: 'rgba(17,24,39,0.45)', zIndex: z.backdrop },
          backdrop,
        ]}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={dismiss}
          accessibilityLabel="Close"
          accessibilityRole="button"
        />
      </Animated.View>
      <Animated.View
        onLayout={(e) => setH(e.nativeEvent.layout.height)}
        accessibilityViewIsModal
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: '88%',
            backgroundColor: c.white,
            borderTopLeftRadius: s(20),
            borderTopRightRadius: s(20),
            zIndex: z.sheet,
            shadowColor: '#111827',
            shadowOpacity: 0.18,
            shadowRadius: 40,
            shadowOffset: { width: 0, height: -12 },
            elevation: 16,
          },
          panel,
        ]}
      >
        <View
          style={{
            width: s(40),
            height: s(5),
            borderRadius: s(5),
            backgroundColor: c.control,
            alignSelf: 'center',
            marginTop: s(8),
            marginBottom: s(4),
          }}
        />
        {title ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(8),
              paddingTop: s(6),
              paddingBottom: s(6),
              paddingLeft: s(18),
              paddingRight: s(8),
            }}
          >
            <Text
              variant="h2"
              size={20}
              oneLine
              accessibilityRole="header"
              style={{ flex: 1, letterSpacing: s(20) * -0.01 }}
            >
              {title}
            </Text>
            {locked ? (
              <View style={{ width: s(44), height: s(44) }} />
            ) : (
              <IconButton icon="x" label="Close" onPress={onClose} />
            )}
          </View>
        ) : null}
        <ScrollView
          bounces={false}
          contentContainerStyle={{
            paddingTop: s(4),
            paddingHorizontal: s(18),
            paddingBottom: footer ? s(12) : s(28) + insets.bottom,
            gap: s(14),
          }}
        >
          {children}
        </ScrollView>
        {footer ? (
          <View style={{ paddingHorizontal: s(18), paddingBottom: s(28) + insets.bottom, gap: s(8) }}>
            {footer}
          </View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

/* ─── Card ───────────────────────────────────────────────────────────────── */
export interface CardProps {
  /** Soft: main-colour tint panel (`.card--soft`). */
  soft?: boolean;
  /** Inner padding 14 (`.card--pad`). */
  pad?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function Card({ soft, pad = true, onPress, accessibilityLabel, style, children }: CardProps) {
  const { c, s, bw } = useTheme();
  const look: ViewStyle = {
    borderWidth: bw(1),
    borderColor: soft ? rgba(c.orgRgb, 0.22) : c.line,
    borderRadius: s(14),
    backgroundColor: soft ? c.orgTint2 : c.white,
    padding: pad ? s(14) : 0,
  };
  if (!onPress) return <View style={[look, style]}>{children}</View>;
  return (
    <Press
      onPress={onPress}
      pressScale={motion.press.row}
      accessibilityLabel={accessibilityLabel}
      style={[look, style]}
    >
      {children}
    </Press>
  );
}

/* ─── Group + Cell ───────────────────────────────────────────────────────── */
/** True for a Cell that follows another row in a Group (it draws the 1px divider). */
const GroupDivider = createContext(false);

/** Rounded list container (`.group`); `flush` = edge to edge. Cells get 1px dividers. */
export function Group({
  flush,
  children,
  style,
}: {
  flush?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { c, s, bw } = useTheme();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View
      style={[
        flush
          ? { backgroundColor: c.white }
          : {
              marginHorizontal: s(16),
              borderWidth: bw(1),
              borderColor: c.line,
              borderRadius: s(14),
              overflow: 'hidden',
              backgroundColor: c.white,
            },
        style,
      ]}
    >
      {items.map((child, i) =>
        // `.cell + .cell` draws its divider inside the cell's min-height (border-box), so a Cell
        // draws its own; anything else gets it on a wrapper.
        child.type === Cell ? (
          <GroupDivider.Provider key={child.key ?? i} value={i > 0}>
            {child}
          </GroupDivider.Provider>
        ) : (
          <View key={child.key ?? i} style={i > 0 ? { borderTopWidth: bw(1), borderTopColor: c.line } : null}>
            {child}
          </View>
        ),
      )}
    </View>
  );
}

export interface CellProps {
  title: string;
  sub?: string;
  /** Leading element: cover, avatar (no icons inside rows, DESIGN.md). */
  lead?: ReactNode;
  /** Trailing text or element. */
  trail?: ReactNode;
  /** Show a chevron after the trail. */
  chevron?: boolean;
  onPress?: () => void;
  /** Align to the top (multi-line rows). */
  top?: boolean;
  /** Highlighted row (`.cell--hl`). */
  highlight?: boolean;
  danger?: boolean;
  /** User-generated titles (names, book titles) may ellipsize; ours never wrap. */
  ugc?: boolean;
  flush?: boolean;
}

export function Cell({
  title,
  sub,
  lead,
  trail,
  chevron,
  onPress,
  top,
  highlight,
  danger,
  ugc,
  flush,
}: CellProps) {
  const { c, s, bw } = useTheme();
  const divider = useContext(GroupDivider);
  const body = (
    <>
      {lead ? <View>{lead}</View> : null}
      <View style={{ flex: 1, minWidth: 0, gap: s(2) }}>
        <Text
          size={14.5}
          weight={600}
          color={danger ? 'err' : 'ink'}
          oneLine={!ugc}
          ellipsis={ugc}
          style={{ lineHeight: s(14.5) * 1.3 }}
        >
          {title}
        </Text>
        {sub ? (
          <Text size={12.5} color="ink3" style={{ lineHeight: s(12.5) * 1.35 }}>
            {sub}
          </Text>
        ) : null}
      </View>
      {trail || chevron ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          {typeof trail === 'string' ? (
            <Text size={13} color="ink3" oneLine>
              {trail}
            </Text>
          ) : (
            trail
          )}
          {chevron ? <Icon name="chev" size="s" color={c.ink3} /> : null}
        </View>
      ) : null}
    </>
  );
  const style: ViewStyle = {
    flexDirection: 'row',
    alignItems: top ? 'flex-start' : 'center',
    gap: s(12),
    paddingVertical: s(12),
    paddingHorizontal: s(flush ? 16 : 14),
    minHeight: s(56),
    backgroundColor: highlight ? c.orgTint2 : 'transparent',
    ...(divider ? { borderTopWidth: bw(1), borderTopColor: c.line } : null),
  };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Press
      onPress={onPress}
      pressScale={motion.press.row}
      accessibilityLabel={sub ? `${title}, ${sub}` : title}
      style={style}
    >
      {body}
    </Press>
  );
}

/* ─── KeyValue ───────────────────────────────────────────────────────────── */
export interface KeyValueRow {
  k: string;
  v: string;
  total?: boolean;
}

/** `.kv`: label/value rows on a grey panel; totals in bold. */
export function KeyValue({ rows, white }: { rows: KeyValueRow[]; white?: boolean }) {
  const { c, s, bw } = useTheme();
  return (
    <View
      style={{
        backgroundColor: white ? c.white : c.surface,
        borderRadius: s(14),
        paddingVertical: s(4),
        paddingHorizontal: s(14),
      }}
    >
      {white ? (
        // `.kv--white` draws its 1px edge as an inset box-shadow: it must not take layout space.
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: s(14),
            borderWidth: 1,
            borderColor: c.line,
          }}
        />
      ) : null}
      {rows.map((r, i) => (
        <View
          key={r.k}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: s(12),
            paddingVertical: s(10),
            borderTopWidth: i > 0 ? bw(1) : 0,
            borderTopColor: c.line,
          }}
        >
          <Text
            size={14}
            weight={r.total ? 600 : 400}
            color={r.total ? 'ink' : 'ink2'}
            tabular
            oneLine
            style={{ flexShrink: 1 }}
          >
            {r.k}
          </Text>
          <Text size={14} weight={r.total ? 800 : 600} tabular oneLine style={{ textAlign: 'right' }}>
            {r.v}
          </Text>
        </View>
      ))}
    </View>
  );
}
