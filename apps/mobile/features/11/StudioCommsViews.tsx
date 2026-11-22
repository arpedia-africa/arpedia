import { ScrollView, View } from 'react-native';
import {
  Avatar,
  Btn,
  Callout,
  Chip,
  EmptyState,
  Field,
  Group,
  motion,
  Pill,
  Press,
  Section,
  Skeleton,
  Text,
  useTheme,
  type AvatarTone,
} from '@arpedia/ui';
import { LabelBlock, SubHero } from './parts';

// s-studio-post, s-studio-inbox. Pure views for the routes and tools/parity
// (`node tools/screen.mjs s-studio-post s-studio-inbox --css`).

// ─── s-studio-post ──────────────────────────────────────────────────────────
export interface StudioPostValues {
  title: string;
  body: string;
}

export const POST_TITLE_MAX = 100;
export const POST_BODY_MAX = 2000;

export function StudioPostView({
  values,
  book,
  audience,
  errors,
  posting,
  onChange,
  onBook,
  onPost,
  onBack,
}: {
  values: StudioPostValues;
  /** Linked book title (rule 31), or null for "No book". */
  book: string | null;
  /** "3.4k followers + club". */
  audience: string;
  errors: Partial<Record<keyof StudioPostValues | 'form', string>>;
  posting?: boolean;
  onChange: (v: Partial<StudioPostValues>) => void;
  onBook: () => void;
  onPost: () => void;
  onBack: () => void;
}) {
  const { s } = useTheme();
  return (
    <>
      <SubHero
        title="New post"
        sub="Goes to your followers and your club"
        onBack={onBack}
        action={
          // .pill.night as a link, 44px touch target around it
          <Press
            onPress={onPost}
            disabled={posting}
            accessibilityRole="button"
            accessibilityLabel="Post"
            hitSlop={8}
            style={{ paddingRight: s(10), opacity: posting ? 0.6 : 1 }}
          >
            <Pill label="Post" tone="night" />
          </Press>
        }
      />
      {/* .form.body-end: gap 16, padding 20 16 28 */}
      <View style={{ paddingTop: s(20), paddingHorizontal: s(16), paddingBottom: s(28), gap: s(16) }}>
        {errors.form ? <Callout tone="err">{errors.form}</Callout> : null}
        <Field
          label="Title"
          value={values.title}
          onChangeText={(title) => onChange({ title })}
          error={errors.title}
          maxLength={POST_TITLE_MAX}
          autoCapitalize="sentences"
        />
        <Field
          label="Post"
          value={values.body}
          onChangeText={(body) => onChange({ body })}
          error={errors.body}
          maxLength={POST_BODY_MAX}
          autoCapitalize="sentences"
          rows={7}
        />
        <LabelBlock label="Goes to">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(8) }}>
            <Press
              onPress={onBook}
              accessibilityRole="button"
              accessibilityLabel={book ? `Linked book: ${book}. Change` : 'Link one of your books'}
              hitSlop={8}
            >
              <Pill label={book ?? 'No book linked'} tone="grey" iconName="book" />
            </Press>
            <Pill label={audience} tone="grey" iconName="users" />
          </View>
        </LabelBlock>
      </View>
    </>
  );
}

// ─── s-studio-inbox ─────────────────────────────────────────────────────────
export type InboxFilter = 'waiting' | 'replied' | 'all';

export interface InboxRow {
  id: string;
  name: string;
  tone: AvatarTone;
  preview: string;
  /** "09:14", "Yesterday", "10 Nov". */
  time: string;
}

export function StudioInboxView({
  filter,
  waiting,
  rows,
  state,
  onFilter,
  onRow,
  onRetry,
  onBack,
}: {
  filter: InboxFilter;
  /** Count on the Waiting chip (hidden at 0). */
  waiting: number;
  rows: InboxRow[];
  state: 'ready' | 'loading' | 'error' | 'offline';
  onFilter: (f: InboxFilter) => void;
  onRow: (id: string) => void;
  onRetry: () => void;
  onBack: () => void;
}) {
  const { s } = useTheme();
  const chips: { value: InboxFilter; label: string }[] = [
    { value: 'waiting', label: waiting ? `Waiting ${waiting}` : 'Waiting' },
    { value: 'replied', label: 'Replied' },
    { value: 'all', label: 'All' },
  ];
  let list;
  if (state === 'loading') {
    list = (
      <Group>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            accessibilityLabel={i === 0 ? 'Loading' : undefined}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(12),
              paddingVertical: s(12),
              paddingHorizontal: s(14),
              minHeight: s(56),
            }}
          >
            <Skeleton width={s(36)} height={s(36)} radius={999} />
            <View style={{ flex: 1, gap: s(6) }}>
              <Skeleton width="40%" height={s(13)} />
              <Skeleton width="80%" height={s(11)} />
            </View>
          </View>
        ))}
      </Group>
    );
  } else if (state !== 'ready') {
    list = (
      <EmptyState
        title={state === 'offline' ? 'You’re offline' : 'Couldn’t load your messages'}
        body={
          state === 'offline'
            ? 'Connect to see what readers sent you.'
            : 'Something went wrong on our side. Try again.'
        }
        action={{ label: 'Try again', onPress: onRetry }}
      />
    );
  } else if (!rows.length) {
    list = (
      <EmptyState
        title="No messages waiting"
        body={
          filter === 'waiting'
            ? 'When a reader sends you a private message, it shows here first.'
            : 'Messages from readers show here.'
        }
      />
    );
  } else {
    list = (
      <Group>
        {rows.map((r) => (
          <InboxCell key={r.id} row={r} onPress={() => onRow(r.id)} />
        ))}
      </Group>
    );
  }
  return (
    <>
      <SubHero title="Private messages" sub="Replies are free for authors" onBack={onBack} />
      {/* .chips.pt16: horizontal row, padding 16 16 0, gap 8 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: s(16), paddingHorizontal: s(16), gap: s(8) }}
        style={{ flexGrow: 0 }}
      >
        {chips.map((c) => (
          <Chip
            key={c.value}
            label={c.label}
            state={filter === c.value ? 'on' : 'off'}
            onPress={() => onFilter(c.value)}
          />
        ))}
      </ScrollView>
      <Section style={{ paddingBottom: s(28) }}>{list}</Section>
    </>
  );
}

/** `a.cell.cell--tap` with `.cell__sub.ell`: the kit Cell, but the preview stays on one line. */
function InboxCell({ row, onPress }: { row: InboxRow; onPress: () => void }) {
  const { s } = useTheme();
  return (
    <Press
      onPress={onPress}
      pressScale={motion.press.row}
      accessibilityRole="button"
      accessibilityLabel={`${row.name}, ${row.preview}, ${row.time}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        paddingVertical: s(12),
        paddingHorizontal: s(14),
        minHeight: s(56),
      }}
    >
      <Avatar name={row.name} tone={row.tone} />
      <View style={{ flex: 1, minWidth: 0, gap: s(2) }}>
        <Text size={14.5} weight={600} ellipsis style={{ lineHeight: s(14.5) * 1.3 }}>
          {row.name}
        </Text>
        <Text size={12.5} color="ink3" ellipsis style={{ lineHeight: s(12.5) * 1.35 }}>
          {row.preview}
        </Text>
      </View>
      <Text size={13} color="ink3" oneLine>
        {row.time}
      </Text>
    </Press>
  );
}

/** Books the author can link to a post: a simple list in a sheet. */
export function BookPicker({
  books,
  current,
  onPick,
}: {
  books: { id: string; title: string }[];
  current: string | null;
  onPick: (id: string | null) => void;
}) {
  const { s } = useTheme();
  return (
    <View style={{ gap: s(8) }}>
      <Btn label="No book" variant={current === null ? 'p' : 's'} block onPress={() => onPick(null)} />
      {books.map((b) => (
        <Btn
          key={b.id}
          label={b.title}
          variant={current === b.id ? 'p' : 's'}
          block
          onPress={() => onPick(b.id)}
        />
      ))}
    </View>
  );
}
