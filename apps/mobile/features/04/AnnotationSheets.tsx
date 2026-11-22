// Flow 04 annotation sheets, one to one with the prototype: s-notes (.seg tabs, .annot rows with the
// excerpt in its colour and .annot__note), s-note-dialog (.excerpt, textarea .field, share switch,
// Save note) and s-discuss (.quote, .chat bubbles with Author badge and reactions, .composer).
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import {
  Avatar,
  Btn,
  Callout,
  Field,
  Icon,
  Pill,
  Press,
  Segmented,
  Sheet,
  Skeleton,
  Text,
  Toggle,
  fontFamily,
  motion,
  useTheme,
} from '@arpedia/ui';
import { HIGHLIGHT_COLORS, type HighlightColor } from '@arpedia/reader';
import type { PassageComment } from './passage';
import { Flush } from './ReaderSheets';

const n = (v: number) => v.toLocaleString('en-NG');

/** `.excerpt`: the quote in the reading font with its highlight colour behind the text. */
function Excerpt({ text, color }: { text: string; color: HighlightColor | null }) {
  const { s } = useTheme();
  return (
    <Text family="reading" size={15} style={{ lineHeight: s(15) * 1.5 }}>
      <Text family="reading" size={15} style={color ? { backgroundColor: HIGHLIGHT_COLORS[color] } : null}>
        {text}
      </Text>
    </Text>
  );
}

// ─── s-notes ────────────────────────────────────────────────────────────────
export interface AnnotRowModel {
  id: string;
  /** "Chapter 7 · The Third Letter"; null when unknown (never guessed, rule 42). */
  label: string | null;
  excerpt: string | null;
  color: HighlightColor | null;
  note: string | null;
  /** Club name when shared, else "Private" on notes. */
  scope: string | null;
}

export type NotesTab = 'highlight' | 'note' | 'bookmark';

const EMPTY: Record<NotesTab, [string, string]> = {
  highlight: ['No highlights yet', 'Press and hold any line to highlight it.'],
  note: ['No notes yet', 'Select a passage and tap Note to keep a thought.'],
  bookmark: ['No bookmarks yet', 'Bookmark a page and it waits for you here.'],
};

export function NotesSheet({
  open,
  onClose,
  rows,
  onRow,
}: {
  open: boolean;
  onClose: () => void;
  rows: Record<NotesTab, AnnotRowModel[]>;
  onRow: (id: string) => void;
}) {
  const { s, c, bw } = useTheme();
  const [tab, setTab] = useState<NotesTab>('highlight');
  useEffect(() => {
    if (open) setTab('highlight');
  }, [open]);
  const list = rows[tab];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      bold
      title="Your notes"
      sub="Highlights, notes and bookmarks in this book"
    >
      <Flush>
        <View style={{ paddingHorizontal: s(16), paddingBottom: s(16) }}>
          <Segmented<NotesTab>
            options={[
              { value: 'highlight', label: `Highlights ${n(rows.highlight.length)}` },
              { value: 'note', label: `Notes ${n(rows.note.length)}` },
              { value: 'bookmark', label: `Bookmarks ${n(rows.bookmark.length)}` },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>
        {/* `.pb`: padding 4 18 28, gap 14 */}
        <View style={{ paddingTop: s(4), paddingHorizontal: s(18), gap: s(14) }}>
          {list.length === 0 ? (
            <View style={{ paddingVertical: s(16), gap: s(4) }}>
              <Text variant="title" center>
                {EMPTY[tab][0]}
              </Text>
              <Text variant="sm" color="ink3" center>
                {EMPTY[tab][1]}
              </Text>
            </View>
          ) : (
            list.map((r, i) => (
              <Press
                key={r.id}
                onPress={() => onRow(r.id)}
                pressScale={motion.press.row}
                accessibilityLabel={[r.label, r.excerpt, r.note].filter(Boolean).join(', ')}
                style={{
                  gap: s(6),
                  ...(i > 0 ? { borderTopWidth: bw(1), borderTopColor: c.line, paddingTop: s(14) } : null),
                }}
              >
                {r.label || r.scope ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
                    <Text variant="xs" color="ink3" oneLine style={{ flex: 1 }}>
                      {r.label ?? ''}
                    </Text>
                    {r.scope ? (
                      <Pill
                        label={r.scope}
                        tone="grey"
                        iconName={r.scope === 'Private' ? undefined : 'users'}
                      />
                    ) : null}
                  </View>
                ) : null}
                {r.excerpt ? <Excerpt text={r.excerpt} color={r.color} /> : null}
                {r.note ? (
                  <Text
                    size={13.5}
                    style={{
                      backgroundColor: c.surface,
                      borderRadius: s(10),
                      paddingVertical: s(8),
                      paddingHorizontal: s(10),
                      overflow: 'hidden',
                    }}
                  >
                    {r.note}
                  </Text>
                ) : null}
              </Press>
            ))
          )}
        </View>
      </Flush>
    </Sheet>
  );
}

// ─── s-note-dialog ──────────────────────────────────────────────────────────
export function NoteDialog({
  open,
  onClose,
  sub,
  quote,
  color,
  initial,
  club,
  busy,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  sub: string;
  quote: string;
  color: HighlightColor;
  initial: string;
  /** The book's club, when the reader is in one (rule 39); the switch is hidden otherwise. */
  club: string | null;
  busy?: boolean;
  onSave: (text: string, share: boolean) => void;
}) {
  const [text, setText] = useState(initial);
  const [share, setShare] = useState(false);
  useEffect(() => {
    if (open) {
      setText(initial);
      setShare(false);
    }
  }, [open, initial]);
  const { s } = useTheme();
  return (
    <Sheet open={open} onClose={onClose} locked={busy} bold title="Note" sub={sub}>
      <Excerpt text={quote} color={color} />
      <Field
        value={text}
        onChangeText={(t) => setText(t.slice(0, 2000))}
        accessibilityLabel="Your note"
        placeholder="What does this make you think?"
        multiline
        numberOfLines={4}
        maxLength={2000}
        textAlignVertical="top"
      />
      {club ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
          <View style={{ flex: 1, minWidth: 0, gap: s(4) }}>
            <Text variant="title" weight={700} ellipsis>
              {`Share with ${club}`}
            </Text>
            <Text variant="xs" color="ink3">
              {share ? `${club} will see it in the club` : 'Off: only you can see this note'}
            </Text>
          </View>
          <Toggle value={share} onChange={setShare} label={`Share with ${club}`} />
        </View>
      ) : null}
      <Btn
        label="Save note"
        block
        loading={busy}
        disabled={!text.trim()}
        onPress={() => onSave(text.trim(), share)}
      />
    </Sheet>
  );
}

// ─── s-discuss ──────────────────────────────────────────────────────────────
export function DiscussSheet({
  open,
  onClose,
  title,
  sub,
  quote,
  quoteSrc,
  comments,
  loading,
  error,
  onRetryLoad,
  onSend,
  onRetry,
  onReact,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub: string;
  quote: string | null;
  quoteSrc: string;
  comments: PassageComment[];
  loading: boolean;
  error: string | null;
  onRetryLoad: () => void;
  onSend: (body: string) => void;
  onRetry: (c: PassageComment) => void;
  onReact: (c: PassageComment, kind: 'heart' | 'pray') => void;
}) {
  const { s, c, bw } = useTheme();
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (open) setDraft('');
  }, [open]);
  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    onSend(body);
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      bold
      title={title}
      sub={sub}
      footer={
        // `.composer`: pill field and round send button over a top border
        <View
          style={{
            marginHorizontal: s(-18),
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(8),
            paddingTop: s(8),
            paddingHorizontal: s(10),
            borderTopWidth: bw(1),
            borderTopColor: c.line,
          }}
        >
          <TextInput
            value={draft}
            onChangeText={(t) => setDraft(t.slice(0, 1000))}
            placeholder="Add to the discussion"
            placeholderTextColor={c.ink3}
            accessibilityLabel="Comment"
            selectionColor={c.org}
            cursorColor={c.org}
            maxLength={1000}
            multiline
            style={{
              flex: 1,
              minHeight: s(44),
              maxHeight: s(120),
              borderRadius: s(22),
              backgroundColor: c.surface,
              paddingHorizontal: s(14),
              paddingVertical: s(10),
              fontFamily: fontFamily('ui', 400),
              fontSize: s(14),
              color: c.ink,
            }}
          />
          <Press
            onPress={send}
            disabled={!draft.trim()}
            pressScale={motion.press.icon}
            accessibilityLabel="Send"
            style={{
              width: s(44),
              height: s(44),
              borderRadius: s(22),
              backgroundColor: c.org,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: draft.trim() ? 1 : 0.5,
            }}
          >
            <Icon name="send" color={c.onOrg} />
          </Press>
        </View>
      }
    >
      <Flush>
        {quote ? (
          <View style={{ paddingHorizontal: s(16) }}>
            <View
              style={{
                backgroundColor: c.orgTint2,
                borderRadius: s(12),
                paddingVertical: s(10),
                paddingHorizontal: s(12),
              }}
            >
              <Text family="reading" italic size={14.5} color="ink2" style={{ lineHeight: s(14.5) * 1.5 }}>
                {`“${quote}”`}
              </Text>
              <Text size={11.5} color="ink3" oneLine style={{ marginTop: s(4) }}>
                {quoteSrc}
              </Text>
            </View>
          </View>
        ) : null}
        {/* `.chat`: padding 14 12, gap 10 */}
        <View style={{ paddingVertical: s(14), paddingHorizontal: s(12), gap: s(10) }}>
          {loading ? (
            [0, 1, 2].map((i) => (
              <View key={i} style={{ flexDirection: 'row', gap: s(8), alignItems: 'flex-end' }}>
                <Skeleton width={s(26)} height={s(26)} radius={s(13)} />
                <Skeleton width={`${70 - i * 12}%`} height={s(52)} radius={s(16)} />
              </View>
            ))
          ) : error ? (
            <View style={{ gap: s(10), paddingHorizontal: s(4) }}>
              <Callout tone={error === 'not_reached' ? 'info' : 'err'}>
                {error === 'not_reached'
                  ? 'Read up to this passage to join its discussion.'
                  : 'The discussion didn’t load. Check your connection.'}
              </Callout>
              {error === 'not_reached' ? null : <Btn label="Try again" variant="s" onPress={onRetryLoad} />}
            </View>
          ) : comments.length === 0 ? (
            <View style={{ paddingVertical: s(12), paddingHorizontal: s(8), gap: s(4) }}>
              <Text variant="title" center>
                Be the first to say something about this passage
              </Text>
              <Text variant="sm" color="ink3" center>
                Readers who reach this page will see it.
              </Text>
            </View>
          ) : (
            comments.map((m) => <Bubble key={m.id} m={m} onRetry={onRetry} onReact={onReact} />)
          )}
        </View>
      </Flush>
    </Sheet>
  );
}

const TONES = ['o', 'm', 'k'] as const;
const toneFor = (id: string) => TONES[[...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TONES.length];

function Bubble({
  m,
  onRetry,
  onReact,
}: {
  m: PassageComment;
  onRetry: (c: PassageComment) => void;
  onReact: (c: PassageComment, kind: 'heart' | 'pray') => void;
}) {
  const { s, c, bw } = useTheme();
  const name = m.mine ? 'You' : (m.user?.name?.split(' ')[0] ?? m.user?.username ?? 'Reader');
  const reacts: { kind: 'heart' | 'pray'; emoji: string; count: number }[] = [
    { kind: 'heart' as const, emoji: '❤️', count: m.hearts },
    { kind: 'pray' as const, emoji: '🙏', count: m.prays },
  ].filter((r) => r.count > 0);
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: s(8),
        alignItems: 'flex-end',
        maxWidth: '86%',
        alignSelf: m.mine ? 'flex-end' : 'flex-start',
      }}
    >
      {m.mine ? null : (
        <Avatar name={m.user?.name ?? name} size="sm" tone={toneFor(m.user?.id ?? m.id) as never} />
      )}
      {/* Long-press a bubble to send a heart; tap a reaction to add or take back yours. */}
      <Press
        onLongPress={m.local || m.mine ? undefined : () => onReact(m, 'heart')}
        pressScale={motion.press.row}
        accessibilityHint={m.local || m.mine ? undefined : 'Long-press to send a heart'}
        style={{
          flexShrink: 1,
          backgroundColor: m.mine ? c.orgTint : c.surface,
          borderTopLeftRadius: s(16),
          borderTopRightRadius: s(16),
          borderBottomLeftRadius: s(m.mine ? 16 : 4),
          borderBottomRightRadius: s(m.mine ? 4 : 16),
          paddingVertical: s(9),
          paddingHorizontal: s(12),
          opacity: m.local === 'sending' ? 0.6 : 1,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6), marginBottom: s(2) }}>
          <Text size={12} weight={700} color="orgInk" ellipsis style={{ flexShrink: 1 }}>
            {name}
          </Text>
          {m.is_author ? (
            <Text
              size={10}
              weight={700}
              color="nightOn"
              style={{
                backgroundColor: c.night,
                borderRadius: s(5),
                paddingHorizontal: s(5),
                paddingVertical: s(1),
                overflow: 'hidden',
              }}
            >
              Author
            </Text>
          ) : null}
        </View>
        {m.body != null ? (
          <Text size={14} style={{ lineHeight: s(14) * 1.4 }}>
            {m.body}
          </Text>
        ) : null}
        {reacts.length ? (
          <View style={{ flexDirection: 'row', gap: s(6), marginTop: s(4) }}>
            {reacts.map((r) => (
              <Press
                key={r.kind}
                onPress={() => onReact(m, r.kind)}
                pressScale={motion.press.icon}
                accessibilityLabel={`${r.kind === 'heart' ? 'Love' : 'Amen'}, ${r.count}`}
                accessibilityState={{ selected: m.my_reactions.includes(r.kind) }}
                hitSlop={s(10)}
                style={{
                  flexDirection: 'row',
                  gap: s(4),
                  backgroundColor: c.white,
                  borderWidth: bw(1),
                  borderColor: m.my_reactions.includes(r.kind) ? c.org : c.line,
                  borderRadius: 999,
                  paddingHorizontal: s(6),
                  paddingVertical: s(1),
                }}
              >
                <Text size={11}>{`${r.emoji} ${n(r.count)}`}</Text>
              </Press>
            ))}
          </View>
        ) : null}
        {m.hidden_until_chapter != null ? (
          <Text size={10.5} color="ink3" style={{ marginTop: s(3), textAlign: 'right' }}>
            {`Spoiler hidden until you reach ch. ${m.hidden_until_chapter}`}
          </Text>
        ) : m.local === 'failed' ? (
          <Press onPress={() => onRetry(m)} accessibilityLabel="Not sent. Tap to retry" hitSlop={s(10)}>
            <Text size={10.5} color="err" style={{ marginTop: s(3), textAlign: 'right' }}>
              Not sent · Retry
            </Text>
          </Press>
        ) : null}
      </Press>
    </View>
  );
}
