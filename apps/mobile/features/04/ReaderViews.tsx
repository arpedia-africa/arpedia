// Flow 04 reader chrome, one to one with the prototype (.rdr, .rd-top, .rd-foot, .chrome, .selbar,
// .endcard.bk-endcard, .pg-card, .rd-toast). The page itself is the WebView; these sit around it.
// Reader colours follow the reader background, never the app theme (rule 64).
import { useRef, useState, type ReactNode } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';
import {
  Btn,
  Icon,
  IconButton,
  KeyValue,
  OnHero,
  Petals,
  Pill,
  Press,
  Skeleton,
  Text,
  Toggle,
  rgba,
  useTheme,
  type IconName,
} from '@arpedia/ui';
import { HIGHLIGHT_COLORS, READER_THEMES, type HighlightColor, type ReaderTheme } from '@arpedia/reader';

const n = (v: number) => v.toLocaleString('en-NG');

export function readerInk(theme: ReaderTheme) {
  const t = READER_THEMES[theme];
  const dark = theme === 'dark';
  return {
    page: t.page,
    text: t.text,
    dark,
    line: dark ? 'rgba(255,255,255,0.08)' : 'rgba(17,24,39,0.08)',
    barBg: dark ? 'rgba(255,255,255,0.14)' : null,
  };
}

/**
 * "Chapter 3 · The Market", or just "Chapter 3" when the chapter has no title of its own (the
 * pipeline names untitled chapters "Chapter N", which read "Chapter 1 · Chapter 1").
 */
export function chapterLabel(n: number, title: string | null | undefined) {
  const t = title?.trim() ?? '';
  return !t || new RegExp(`^chapter\\s+${n}$`, 'i').test(t) ? `Chapter ${n}` : `Chapter ${n} · ${t}`;
}

/** `.rd-top`: back, title and sub line, bookmark, more. */
export function ReaderTop({
  theme,
  title,
  sub,
  onBack,
  onBookmark,
  bookmarked,
  onMore,
}: {
  theme: ReaderTheme;
  title: string;
  sub: string;
  onBack: () => void;
  onBookmark?: () => void;
  bookmarked?: boolean;
  onMore: () => void;
}) {
  const { s, bw, c } = useTheme();
  const ink = readerInk(theme);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(2),
        paddingHorizontal: s(6),
        minHeight: s(52),
        borderBottomWidth: bw(1),
        borderBottomColor: ink.line,
        backgroundColor: ink.page,
      }}
    >
      <IconButton icon="back" label="Back to book" onPress={onBack} color={ink.text} />
      <View style={{ flex: 1, minWidth: 0, paddingLeft: s(2) }}>
        <Text size={14} weight={600} color={ink.text} ellipsis>
          {title}
        </Text>
        <Text size={11.5} color={rgba(hexRgb(ink.text), 0.65)} oneLine>
          {sub}
        </Text>
      </View>
      {onBookmark ? (
        <IconButton
          icon="bookmark"
          label={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
          onPress={onBookmark}
          color={bookmarked ? c.org : ink.text}
        />
      ) : null}
      <IconButton icon="more" label="More" onPress={onMore} color={ink.text} />
    </View>
  );
}

const hexRgb = (hex: string) => {
  const h = hex.replace('#', '');
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
};

/** `.bar.thin` inside the reader (`.rdr.dark .bar` on Dark). */
function ThinBar({
  value,
  theme,
  thick,
  track,
}: {
  value: number;
  theme: ReaderTheme;
  thick?: boolean;
  track?: string;
}) {
  const { s, c } = useTheme();
  const ink = readerInk(theme);
  return (
    <View
      style={{
        flex: 1,
        height: s(thick ? 5 : 3),
        borderRadius: s(5),
        backgroundColor: track ?? ink.barBg ?? c.surface,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: '100%',
          borderRadius: s(5),
          backgroundColor: c.acc,
        }}
      />
    </View>
  );
}

/** `.rd-foot`: whole percent, thin bar, time left. Always visible (rule 18). */
export function ReaderFoot({
  theme,
  percent,
  right,
}: {
  theme: ReaderTheme;
  percent: number;
  right: string;
}) {
  const { s } = useTheme();
  const ink = readerInk(theme);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        paddingTop: s(10),
        paddingHorizontal: s(24),
        paddingBottom: s(26),
        opacity: 0.75,
        backgroundColor: ink.page,
      }}
    >
      <Text size={11.5} color={ink.text} tabular oneLine>
        {`${Math.floor(percent)}%`}
      </Text>
      <ThinBar value={percent} theme={theme} />
      <Text size={11.5} color={ink.text} oneLine>
        {right}
      </Text>
    </View>
  );
}

/** First-page skeleton: heading and three lines, never a spinner over text (States: Loading). */
export function ReaderSkeleton({ theme }: { theme: ReaderTheme }) {
  const { s } = useTheme();
  const ink = readerInk(theme);
  return (
    <View
      style={{ flex: 1, backgroundColor: ink.page, paddingTop: s(20), paddingHorizontal: s(24), gap: s(12) }}
    >
      <Skeleton width={s(80)} height={s(11)} radius={s(4)} />
      <Skeleton width="70%" height={s(26)} radius={s(6)} style={{ marginBottom: s(8) }} />
      <Skeleton width="100%" height={s(14)} />
      <Skeleton width="96%" height={s(14)} />
      <Skeleton width="88%" height={s(14)} />
    </View>
  );
}

// ─── Controls (.chrome) ──────────────────────────────────────────────────────
export interface ChromeProps {
  percent: number;
  page: number;
  pages: number;
  chapter: number;
  chapters: number;
  /** While dragging: the target the label shows (rule 21). */
  onScrub: (percent: number | null) => string | null;
  onRelease: (percent: number) => void;
  actions: { icon: IconName; label: string; onPress: () => void }[];
  bottomInset: number;
}

export function ReaderChrome(p: ChromeProps) {
  const { s, c } = useTheme();
  const [drag, setDrag] = useState<number | null>(null);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const width = useRef(1);
  const x0 = useRef(0);
  const toPct = (x: number) => Math.max(0, Math.min(100, (x / width.current) * 100));
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        x0.current = e.nativeEvent.locationX;
        const v = toPct(x0.current);
        setDrag(v);
        setDragLabel(p.onScrub(v));
      },
      onPanResponderMove: (_e, g) => {
        const v = toPct(x0.current + g.dx);
        setDrag(v);
        setDragLabel(p.onScrub(v));
      },
      onPanResponderRelease: (_e, g) => {
        const v = toPct(x0.current + g.dx);
        setDrag(null);
        setDragLabel(null);
        p.onScrub(null);
        p.onRelease(v);
      },
      onPanResponderTerminate: () => {
        setDrag(null);
        setDragLabel(null);
        p.onScrub(null);
      },
    }),
  ).current;
  const shown = drag ?? p.percent;
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: c.night,
        paddingTop: s(14),
        paddingHorizontal: s(18),
        paddingBottom: s(26) + p.bottomInset,
        gap: s(12),
        zIndex: 6,
      }}
    >
      <View
        {...pan.panHandlers}
        onLayout={(e: LayoutChangeEvent) => (width.current = Math.max(1, e.nativeEvent.layout.width))}
        accessibilityRole="adjustable"
        accessibilityLabel="Reading progress"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(shown) }}
        style={{ height: s(24), justifyContent: 'center' }}
      >
        <ThinBar value={shown} theme="light" thick track="rgba(255,255,255,0.18)" />
        <View
          style={{
            position: 'absolute',
            left: `${shown}%`,
            width: s(20),
            height: s(20),
            marginLeft: -s(10),
            borderRadius: s(10),
            backgroundColor: '#FFFFFF',
            borderWidth: s(4),
            borderColor: rgba(c.orgRgb, 0.35),
          }}
        />
      </View>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s(10) }}
      >
        <Text size={12} color="#FFFFFF" tabular oneLine style={{ flexShrink: 1 }}>
          <Text size={12} weight={700} color="#FFFFFF">
            {dragLabel ?? `${Math.floor(shown)}% read`}
          </Text>
          {dragLabel ? '' : ` · page ${n(p.page)} of ${n(p.pages)}`}
        </Text>
        <Text size={12} weight={700} color="#FFFFFF" oneLine>
          {`Chapter ${p.chapter} of ${p.chapters}`}
        </Text>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {p.actions.map((a) => (
          <Press
            key={a.label}
            onPress={a.onPress}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            style={{
              flex: 1,
              minHeight: s(48),
              alignItems: 'center',
              justifyContent: 'center',
              gap: s(4),
              borderRadius: s(10),
            }}
          >
            <Icon name={a.icon} color={c.org} />
            <Text size={11} weight={600} color="#FFFFFF" oneLine>
              {a.label}
            </Text>
          </Press>
        ))}
      </View>
    </View>
  );
}

// ─── Highlight toolbar (.selbar) ─────────────────────────────────────────────
export const SELBAR_HEIGHT = 60;

export function SelectionBar({
  y,
  placement,
  arrowX,
  colors,
  current,
  onColor,
  onNote,
  onDiscuss,
  onClub,
  onShare,
  onDelete,
}: {
  y: number;
  placement: 'above' | 'below' | 'docked';
  arrowX: number | null;
  colors: HighlightColor[];
  current: HighlightColor;
  onColor: (c: HighlightColor) => void;
  onNote: () => void;
  /** Absent while the `paragraph_discussions` flag is off (flow 16 rule 27). */
  onDiscuss?: () => void;
  onClub?: () => void;
  onShare?: () => void;
  /** Tap on an existing highlight (rule 36): the same bar with Delete in place of Club and Share. */
  onDelete?: () => void;
}) {
  const { s, c } = useTheme();
  const btn = (icon: IconName, label: string, onPress: () => void) => (
    <Press
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flex: 1,
        minHeight: s(44),
        alignItems: 'center',
        justifyContent: 'center',
        gap: s(3),
        borderRadius: s(10),
        paddingVertical: s(4),
      }}
    >
      <Icon name={icon} color={c.org} />
      <Text size={10.5} weight={600} color="#FFFFFF" oneLine>
        {label}
      </Text>
    </Press>
  );
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={onDelete ? 'Highlight' : 'Selected text'}
      style={{
        position: 'absolute',
        left: s(12),
        right: s(12),
        top: y,
        zIndex: 5,
        backgroundColor: c.night,
        borderRadius: s(16),
        padding: s(8),
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(2),
        shadowColor: '#000',
        shadowOpacity: 0.5,
        shadowRadius: s(15),
        shadowOffset: { width: 0, height: s(14) },
        elevation: 12,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          gap: s(7),
          paddingLeft: s(4),
          paddingRight: s(8),
          marginRight: s(2),
          borderRightWidth: 1,
          borderRightColor: 'rgba(255,255,255,0.18)',
        }}
      >
        {colors.map((col) => (
          <Press
            key={col}
            onPress={() => onColor(col)}
            accessibilityRole="button"
            accessibilityLabel={col[0]!.toUpperCase() + col.slice(1)}
            hitSlop={s(11)}
            style={{
              width: s(22),
              height: s(22),
              borderRadius: s(11),
              backgroundColor: HIGHLIGHT_COLORS[col],
              ...(col === current
                ? { borderWidth: s(2), borderColor: c.night, outlineWidth: s(2), outlineColor: '#FFFFFF' }
                : null),
            }}
          />
        ))}
      </View>
      {btn('pen', 'Note', onNote)}
      {onDiscuss ? btn('chat', 'Discuss', onDiscuss) : null}
      {onClub ? btn('users', 'Club', onClub) : null}
      {onShare ? btn('share', 'Share', onShare) : null}
      {onDelete ? btn('trash', 'Delete', onDelete) : null}
      {placement !== 'docked' && arrowX != null ? (
        <View
          style={{
            position: 'absolute',
            left: arrowX - s(5),
            [placement === 'above' ? 'bottom' : 'top']: -s(5),
            width: s(10),
            height: s(10),
            backgroundColor: c.night,
            transform: [{ rotate: '45deg' }],
          }}
        />
      ) : null}
    </View>
  );
}

// ─── Cards in the page flow (.endcard.bk-endcard) ────────────────────────────
function EndCard({
  children,
  onLayout,
  top,
}: {
  children: ReactNode;
  onLayout: (h: number) => void;
  top: number | null;
}) {
  const { s, c } = useTheme();
  return (
    <OnHero.Provider value>
      <View
        onLayout={(e) => onLayout(Math.ceil(e.nativeEvent.layout.height))}
        style={{
          position: 'absolute',
          left: s(24),
          right: s(24),
          top: top ?? 0,
          opacity: top == null ? 0 : 1,
          borderRadius: s(16),
          padding: s(16),
          gap: s(12),
          backgroundColor: c.org,
          overflow: 'hidden',
        }}
        pointerEvents={top == null ? 'none' : 'auto'}
      >
        <Petals size={s(240)} style={{ right: s(-100), top: s(-110) }} />
        {children}
      </View>
    </OnHero.Provider>
  );
}

/** s-preview-end: "You've read the free 10%" (rule 52). */
export function PreviewEndCard(p: {
  top: number | null;
  onLayout: (h: number) => void;
  previewPercent: number;
  author: string;
  pages: number;
  price: number;
  balance: number;
  perChapter: number;
  onUnlockAll: () => void;
  onPayGo: () => void;
  onNotNow: () => void;
}) {
  const { s } = useTheme();
  return (
    <EndCard top={p.top} onLayout={p.onLayout}>
      <View style={{ flexDirection: 'row' }}>
        <Pill tone="night" label={`You've read the free ${Math.round(p.previewPercent)}%`} />
      </View>
      <Text variant="h2" color="onOrg">{`Keep going with ${p.author}`}</Text>
      <KeyValue
        white
        rows={[
          { k: `Whole book · ${n(p.pages)} pages`, v: `${n(p.price)} credits` },
          { k: 'Your balance', v: `${n(p.balance)} credits` },
        ]}
      />
      <Btn variant="n" block label={`Unlock all · ${n(p.price)} credits`} onPress={p.onUnlockAll} />
      {p.perChapter > 0 ? (
        <Btn
          variant="s"
          size="md"
          block
          label={`Pay as you read · about ${n(p.perChapter)} a chapter`}
          onPress={p.onPayGo}
        />
      ) : null}
      <Press
        onPress={p.onNotNow}
        accessibilityRole="link"
        style={{ minHeight: s(44), justifyContent: 'center' }}
      >
        <Text size={13} weight={600} color="onOrg" center oneLine>
          Not now, back to the book
        </Text>
      </Press>
    </EndCard>
  );
}

/** s-reader-chapter: the chapter card at a locked chapter's first page (rule 53). */
export function ChapterCard(p: {
  top: number | null;
  onLayout: (h: number) => void;
  number: number;
  title: string;
  price: number;
  paid: number;
  total: number;
  balance: number;
  remaining: number;
  busy: boolean;
  offline: boolean;
  autoUnlock: boolean;
  onUnlock: () => void;
  onPayRest: () => void;
  onAuto: (v: boolean) => void;
}) {
  const { s, c } = useTheme();
  return (
    <EndCard top={p.top} onLayout={p.onLayout}>
      <Text size={13} weight={600} color="onOrg" oneLine>
        Next up
      </Text>
      <Text variant="h2" color="onOrg" numberOfLines={2}>
        {chapterLabel(p.number, p.title)}
      </Text>
      <KeyValue
        white
        rows={[
          { k: 'This chapter', v: `${n(p.price)} credits` },
          { k: 'Paid so far', v: `${n(p.paid)} of ${n(p.total)}` },
          { k: 'Your balance', v: `${n(p.balance)} credits` },
        ]}
      />
      {p.offline ? (
        <Text size={13} weight={600} color="onOrg" center>
          Connect to unlock
        </Text>
      ) : (
        <>
          <Btn
            variant="n"
            block
            label={`Unlock chapter · ${n(p.price)} credits`}
            loading={p.busy}
            onPress={p.onUnlock}
          />
          {p.remaining > p.price ? (
            <Btn
              variant="s"
              size="md"
              block
              label={`Pay the rest · ${n(p.remaining)} credits`}
              onPress={p.onPayRest}
            />
          ) : null}
        </>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: s(12),
          paddingTop: s(4),
          borderTopWidth: 1,
          borderTopColor: rgba(c.onOrgRgb, 0.14),
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: s(4) }}>
          <Text size={15} weight={600} color="onOrg" oneLine>
            Auto-unlock next chapter
          </Text>
          <Text size={12} color="onOrg" style={{ lineHeight: s(12) * 1.4 }}>
            Take each chapter's credits as I turn the page
          </Text>
        </View>
        <Toggle value={p.autoUnlock} onChange={p.onAuto} label="Auto-unlock next chapter" />
      </View>
    </EndCard>
  );
}

/** s-reader-unlocked: `.rd-toast`, 8 s, floats over the footer (rule 58). */
export function UnlockedToast({
  text,
  onUndo,
  bottom,
}: {
  text: string;
  onUndo?: () => void;
  bottom: number;
}) {
  const { s, c } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        left: s(16),
        right: s(16),
        bottom,
        zIndex: 50,
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        paddingVertical: s(12),
        paddingHorizontal: s(16),
        borderRadius: s(14),
        backgroundColor: c.night,
        shadowColor: '#000',
        shadowOpacity: 0.5,
        shadowRadius: s(14),
        shadowOffset: { width: 0, height: s(12) },
        elevation: 10,
      }}
    >
      <Text size={13.5} color="#FFFFFF" style={{ flex: 1 }} oneLine>
        {text}
      </Text>
      {onUndo ? (
        <Press onPress={onUndo} accessibilityRole="button" hitSlop={s(12)}>
          <Text size={13.5} weight={700} color={c.org}>
            Undo
          </Text>
        </Press>
      ) : null}
    </View>
  );
}
