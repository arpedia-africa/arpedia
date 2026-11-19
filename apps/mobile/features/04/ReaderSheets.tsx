// Flow 04 reader sheets, one to one with the prototype: s-chapters (.seg + .group--flush cells with a
// number lead, Read pill or progress ring), s-reader-settings (.bk-hlrow, .swatches, .bk-size, chips,
// segments, Auto-unlock) and s-reader-menu (.rd-menu cells). Views stay pure: data comes in as props.
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  Btn,
  Callout,
  Chip,
  Field,
  Icon,
  Pill,
  Press,
  Ring,
  Segmented,
  Sheet,
  Text,
  Toggle,
  motion,
  useTheme,
} from '@arpedia/ui';
import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LINE_SPACINGS,
  type HighlightColor,
  type ReaderFont,
  type ReaderLayout,
  type ReaderSettings,
  type ReaderTheme,
} from '@arpedia/reader';

const n = (v: number) => v.toLocaleString('en-NG');

/** Row of a flush group (`.group--flush .cell`): padding 12/16, 1px divider from the second row. */
function Row({
  first,
  minHeight = 56,
  highlight,
  onPress,
  label,
  children,
}: {
  first: boolean;
  minHeight?: number;
  highlight?: boolean;
  onPress: () => void;
  label: string;
  children: ReactNode;
}) {
  const { c, s, bw } = useTheme();
  return (
    <Press
      onPress={onPress}
      pressScale={motion.press.row}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        paddingVertical: s(12),
        paddingHorizontal: s(16),
        minHeight: s(minHeight),
        backgroundColor: highlight ? c.orgTint2 : c.white,
        ...(first ? null : { borderTopWidth: bw(1), borderTopColor: c.line }),
      }}
    >
      {children}
    </Press>
  );
}

/** `.cell__body`: title (600, or 500 with `--reg`) and an optional sub line. */
function RowBody({ title, sub, reg, ugc }: { title: string; sub?: string; reg?: boolean; ugc?: boolean }) {
  const { s } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, gap: s(2) }}>
      <Text
        size={14.5}
        weight={reg ? 500 : 600}
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
  );
}

/** The sheet body sits edge to edge (`.panel > .inset` / `.body`), not inside `.pb`'s padding. */
function Flush({ children }: { children: ReactNode }) {
  const { s } = useTheme();
  return <View style={{ marginHorizontal: s(-18), marginTop: s(-16) }}>{children}</View>;
}

// ─── s-chapters ─────────────────────────────────────────────────────────────
export interface ChapterRowModel {
  key: string;
  /** Chapter number; null for parts and front matter. */
  number: number | null;
  title: string;
  state: 'read' | 'current' | 'locked' | 'none';
  /** Current chapter: 0–1 through it. */
  through?: number;
  price?: number;
}

export interface BookmarkRowModel {
  id: string;
  title: string;
  sub?: string;
}

export function ChaptersSheet({
  open,
  onClose,
  sub,
  chapters,
  bookmarks,
  bookmarked,
  onChapter,
  onBookmark,
  onToggleBookmark,
}: {
  open: boolean;
  onClose: () => void;
  sub: string;
  chapters: ChapterRowModel[];
  bookmarks: BookmarkRowModel[];
  /** The page on screen already has a bookmark. */
  bookmarked: boolean;
  onChapter: (key: string) => void;
  onBookmark: (id: string) => void;
  onToggleBookmark: () => void;
}) {
  const { s } = useTheme();
  const [tab, setTab] = useState<'chapters' | 'bookmarks'>('chapters');
  useEffect(() => {
    if (open) setTab('chapters');
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} bold title="Chapters" sub={sub}>
      <Flush>
        <View style={{ paddingHorizontal: s(16), paddingBottom: s(16) }}>
          <Segmented
            options={[
              { value: 'chapters', label: 'Chapters' },
              { value: 'bookmarks', label: `Bookmarks ${n(bookmarks.length)}` },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>
        {tab === 'chapters' ? (
          <View>
            {chapters.map((ch, i) => (
              <ChapterRow key={ch.key} first={i === 0} ch={ch} onPress={() => onChapter(ch.key)} />
            ))}
          </View>
        ) : (
          <View>
            <View style={{ paddingHorizontal: s(16), paddingBottom: s(12) }}>
              <Btn
                label={bookmarked ? 'Remove bookmark from this page' : 'Bookmark this page'}
                variant="s"
                block
                onPress={onToggleBookmark}
              />
            </View>
            {bookmarks.length === 0 ? (
              <View style={{ paddingHorizontal: s(16), paddingVertical: s(20), gap: s(4) }}>
                <Text variant="title" center>
                  No bookmarks yet
                </Text>
                <Text variant="sm" color="ink3" center>
                  Bookmark a page and it waits for you here.
                </Text>
              </View>
            ) : (
              bookmarks.map((b, i) => (
                <Row
                  key={b.id}
                  first={i === 0}
                  onPress={() => onBookmark(b.id)}
                  label={b.sub ? `${b.title}, ${b.sub}` : b.title}
                >
                  <RowBody title={b.title} sub={b.sub} reg ugc />
                </Row>
              ))
            )}
          </View>
        )}
      </Flush>
    </Sheet>
  );
}

function ChapterRow({ ch, first, onPress }: { ch: ChapterRowModel; first: boolean; onPress: () => void }) {
  const { s } = useTheme();
  const current = ch.state === 'current';
  const sub = current
    ? `You're here · ${Math.round((ch.through ?? 0) * 100)}% through`
    : ch.state === 'locked' && ch.price
      ? `Locked · ${n(ch.price)} credits`
      : undefined;
  return (
    <Row first={first} highlight={current} onPress={onPress} label={sub ? `${ch.title}, ${sub}` : ch.title}>
      {/* `.cell__lead.t-num`: muted number, brand and bold on the current chapter */}
      <Text
        tabular
        weight={current ? 700 : 400}
        color={current ? 'orgInk' : 'ink3'}
        style={{ minWidth: s(ch.number == null ? 0 : 8) }}
      >
        {ch.number == null ? '' : String(ch.number)}
      </Text>
      <RowBody title={ch.title} sub={sub} reg={!current} ugc />
      {ch.state === 'read' ? (
        <Pill label="Read" tone="ok" />
      ) : current ? (
        <Ring value={ch.through ?? 0} />
      ) : null}
    </Row>
  );
}

// ─── s-reader-settings ──────────────────────────────────────────────────────
/** `.bk-hl--*` swatch colours, in the prototype's order. */
const SWATCHES: { key: HighlightColor; label: string; bg: string }[] = [
  { key: 'green', label: 'Green', bg: '#B7F0C8' },
  { key: 'yellow', label: 'Yellow', bg: '#FDE08A' },
  { key: 'blue', label: 'Blue', bg: '#B3E3F8' },
  { key: 'pink', label: 'Pink', bg: '#F7BBD0' },
  { key: 'purple', label: 'Purple', bg: '#D8BFE6' },
  { key: 'peach', label: 'Peach', bg: '#FCD2A8' },
];

/** `.swatch--*`: page colour, text colour and edge per reader background. */
const BACKGROUNDS: { key: ReaderTheme; label: string; bg: string; fg: string; edge: string }[] = [
  { key: 'light', label: 'Light', bg: '#FFFFFF', fg: '#1D1A16', edge: '' },
  { key: 'sepia', label: 'Sepia', bg: '#F6EBD9', fg: '#3B2F22', edge: '#E6D6BC' },
  { key: 'dark', label: 'Dark', bg: '#14110D', fg: '#E8E0D4', edge: '' },
];

const FONTS: { key: ReaderFont; label: string }[] = [
  { key: 'literata', label: 'Literata' },
  { key: 'inter', label: 'Inter' },
  { key: 'serif', label: 'Georgia' },
  { key: 'atkinson', label: 'Atkinson' },
];

type Spacing = keyof typeof LINE_SPACINGS;
const spacingOf = (v: number): Spacing =>
  (Object.keys(LINE_SPACINGS) as Spacing[]).find((k) => LINE_SPACINGS[k] === v) ?? 'normal';

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  const { s } = useTheme();
  return (
    <View style={{ gap: s(8) }}>
      <Text variant="label" oneLine>
        {label}
      </Text>
      {children}
    </View>
  );
}

export function SettingsSheet({
  open,
  onClose,
  settings,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onChange: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void;
}) {
  const { c, s, bw } = useTheme();
  const size = settings.font_size;
  return (
    <Sheet open={open} onClose={onClose} bold title="Settings">
      <Labelled label="Highlight color">
        <View style={{ flexDirection: 'row', gap: s(8) }}>
          {SWATCHES.map((h) => {
            const on = settings.highlight_color === h.key;
            return (
              <Press
                key={h.key}
                onPress={() => onChange('highlight_color', h.key)}
                accessibilityLabel={h.label}
                accessibilityState={{ selected: on }}
                style={{ flex: 1, height: s(34) }}
              >
                {/* .bk-hl.is-selected: 2px white then 2px main colour outside the swatch */}
                {on ? (
                  <View
                    style={{
                      position: 'absolute',
                      inset: s(-4),
                      borderRadius: s(14),
                      borderWidth: s(2),
                      borderColor: c.org,
                    }}
                  />
                ) : null}
                <View
                  style={{
                    flex: 1,
                    borderRadius: s(10),
                    backgroundColor: h.bg,
                    borderWidth: on ? 0 : bw(1),
                    borderColor: 'rgba(17,24,39,0.08)',
                  }}
                />
              </Press>
            );
          })}
        </View>
      </Labelled>

      <Labelled label="Background color">
        <View style={{ flexDirection: 'row', gap: s(8) }}>
          {BACKGROUNDS.map((b) => {
            const on = settings.theme === b.key;
            return (
              <Press
                key={b.key}
                onPress={() => onChange('theme', b.key)}
                accessibilityLabel={b.label}
                accessibilityState={{ selected: on }}
                pressScale={motion.press.button}
                style={{
                  flex: 1,
                  minHeight: s(56),
                  borderRadius: s(12),
                  backgroundColor: b.bg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: on ? s(2) : bw(1),
                  borderColor: on ? c.org : b.edge || c.line,
                }}
              >
                {/* .swatch.is-selected: inset 2px main colour, then 2px white inside it */}
                {on ? (
                  <View
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: s(10),
                      borderWidth: s(2),
                      borderColor: '#FFFFFF',
                    }}
                  />
                ) : null}
                <Text family="reading" size={15} color={b.fg} oneLine>
                  {b.label}
                </Text>
              </Press>
            );
          })}
        </View>
      </Labelled>

      <Labelled label="Font size">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
          <Btn
            label="− A"
            variant="s"
            size="sm"
            disabled={size <= FONT_SIZE_MIN}
            onPress={() => onChange('font_size', Math.max(FONT_SIZE_MIN, size - 1))}
          />
          <Text variant="h3" tabular center oneLine style={{ flex: 1 }}>
            {String(size)}
          </Text>
          <Btn
            label="+ A"
            size="sm"
            disabled={size >= FONT_SIZE_MAX}
            onPress={() => onChange('font_size', Math.min(FONT_SIZE_MAX, size + 1))}
          />
        </View>
      </Labelled>

      <Labelled label="Font">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(8) }}>
          {FONTS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              state={settings.font === f.key ? 'on' : 'off'}
              onPress={() => onChange('font', f.key)}
            />
          ))}
        </View>
      </Labelled>

      <Labelled label="Line spacing">
        <Segmented<Spacing>
          options={[
            { value: 'tight', label: 'Tight' },
            { value: 'normal', label: 'Normal' },
            { value: 'loose', label: 'Loose' },
          ]}
          value={spacingOf(settings.line_spacing)}
          onChange={(v) => onChange('line_spacing', LINE_SPACINGS[v])}
        />
      </Labelled>

      <Labelled label="Layout">
        <Segmented<ReaderLayout>
          options={[
            { value: 'pages', label: 'Pages' },
            { value: 'scroll', label: 'Scroll' },
          ]}
          value={settings.layout}
          onChange={(v) => onChange('layout', v)}
        />
      </Labelled>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
        <View style={{ flex: 1, minWidth: 0, gap: s(4) }}>
          <Text variant="title" weight={700} oneLine>
            Auto-unlock next chapter
          </Text>
          <Text variant="xs" color="ink3">
            For pay-as-you-read books. Off: we ask at each chapter.
          </Text>
        </View>
        <Toggle
          value={settings.auto_unlock}
          onChange={(v) => onChange('auto_unlock', v)}
          label="Auto-unlock next chapter"
        />
      </View>

      <Btn label="Done" icon="check" block onPress={onClose} />
    </Sheet>
  );
}

// ─── s-reader-menu ──────────────────────────────────────────────────────────
export interface MenuItem {
  key: string;
  title: string;
  sub?: string;
  /** Rows that open another screen carry a chevron; Report doesn't. */
  chevron?: boolean;
  onPress: () => void;
}

export function ReaderMenuSheet({
  open,
  onClose,
  title,
  sub,
  items,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub: string;
  items: MenuItem[];
}) {
  const { c } = useTheme();
  return (
    <Sheet open={open} onClose={onClose} bold title={title} sub={sub}>
      <Flush>
        {items.map((it, i) => (
          <Row
            key={it.key}
            first={i === 0}
            minHeight={52}
            onPress={it.onPress}
            label={it.sub ? `${it.title}, ${it.sub}` : it.title}
          >
            <RowBody title={it.title} sub={it.sub} />
            {it.chevron ? <Icon name="chev" color={c.ink3} /> : null}
          </Row>
        ))}
      </Flush>
    </Sheet>
  );
}

/** Report a problem with this book (rule 26): an optional note, then a `book_content` report. */
export function ReportProblemSheet({
  open,
  onClose,
  busy,
  failed,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  failed: boolean;
  onSend: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) setNote('');
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} locked={busy} title="Report a problem">
      <Text variant="sm" color="ink2">
        Missing pages, wrong chapter or broken text. We send the page you're on with it.
      </Text>
      <Field
        label="What's wrong? (optional)"
        value={note}
        onChangeText={(t) => setNote(t.slice(0, 500))}
        multiline
        maxLength={500}
        placeholder="Tell us what you see"
      />
      {failed ? <Callout tone="err">That didn’t send. Check your connection and try again.</Callout> : null}
      <Btn label="Send report" block loading={busy} onPress={() => onSend(note)} />
    </Sheet>
  );
}
