import { useRef, useState, type ComponentRef } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import {
  Btn,
  Cover,
  Field,
  Hero,
  IconButton,
  Press,
  Segmented,
  Skeleton,
  Text,
  motion,
  useTheme,
  type CoverTone,
} from '@arpedia/ui';
import {
  ROOM_CODE_LENGTH,
  joinButtonLabel,
  normaliseRoomCode,
  roomNameError,
  type RoomJoinPolicy,
  type RoomPace,
} from '@arpedia/core';
import { Foot } from '../01/StepViews';
import { FormError, OnbSheet } from '../01/parts';

// Flow 07 create-room and join-code pieces that mirror prototype elements one to one
// (`node tools/screen.mjs s-create-room s-join-code --css`).

/** `.hero` with a close (✕) in the bar, a title and one line of sub. */
function CloseHero({ title, sub, onClose }: { title: string; sub: string; onClose: () => void }) {
  const { c } = useTheme();
  return (
    <Hero
      barBack
      bar={<IconButton icon="x" label="Close" onPress={onClose} color={c.onOrg} />}
      title={title}
      sub={sub}
    />
  );
}

export interface PickBook {
  id: string;
  title: string;
  tone: CoverTone;
  coverUrl?: string;
}

/** `.com-pick` button: 86 wide, 78×117 cover over a two-line title; selected = 2.5 ring on tint. */
function BookPickItem({ book, on, onPress }: { book: PickBook; on: boolean; onPress: () => void }) {
  const { c, s } = useTheme();
  return (
    <Press
      onPress={onPress}
      pressScale={motion.press.row}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={book.title}
      style={{
        width: s(86),
        padding: s(1.5),
        borderWidth: s(2.5),
        borderColor: on ? c.org : 'transparent',
        borderRadius: s(12),
        backgroundColor: on ? c.orgTint2 : 'transparent',
        gap: s(6),
      }}
    >
      <View style={{ width: s(78) }}>
        <Cover title={book.title} fluid tone={book.tone} uri={book.coverUrl} size={88} />
      </View>
      <Text size={12} weight={600} ellipsis numberOfLines={2} style={{ lineHeight: s(12) * 1.45 }}>
        {book.title}
      </Text>
    </Press>
  );
}

function BookPicker({
  books,
  loading,
  error,
  value,
  onChange,
  onRetry,
}: {
  books: PickBook[];
  loading?: boolean;
  error?: boolean;
  value: string | null;
  onChange: (id: string) => void;
  onRetry?: () => void;
}) {
  const { s } = useTheme();
  return (
    <View style={{ gap: s(8) }}>
      <Text variant="label" oneLine>
        Choose the book
      </Text>
      {loading ? (
        <View style={{ flexDirection: 'row', gap: s(10) }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ width: s(86), gap: s(6) }}>
              <Skeleton width={s(78)} height={117} radius={6} />
              <Skeleton width="80%" height={12} />
            </View>
          ))}
        </View>
      ) : error ? (
        <View style={{ gap: s(8), alignItems: 'flex-start' }}>
          <Text size={13.5} color="ink2">
            Couldn't load your books.
          </Text>
          <Btn label="Try again" variant="g" size="sm" onPress={onRetry} />
        </View>
      ) : books.length === 0 ? (
        <Text size={13.5} color="ink2" style={{ lineHeight: s(13.5) * 1.45 }}>
          Unlock a book first. Rooms are for books in your library.
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityRole="radiogroup"
          contentContainerStyle={{
            gap: s(10),
            paddingHorizontal: s(2),
            paddingTop: s(2),
            paddingBottom: s(4),
          }}
        >
          {books.map((b) => (
            <BookPickItem key={b.id} book={b} on={b.id === value} onPress={() => onChange(b.id)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export interface CreateRoomValues {
  name: string;
  book: string | null;
  pace: RoomPace;
  join: RoomJoinPolicy;
}

const PACES: { value: RoomPace; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'three_week', label: '3 ch. a week' },
  { value: 'one_day', label: '1 ch. a day' },
];
const JOINS: { value: RoomJoinPolicy; label: string }[] = [
  { value: 'code', label: 'Invite code' },
  { value: 'anyone', label: 'Anyone' },
];

/** `s-create-room`: hero, then the form on the white sheet (name, book, pace, who can join). */
export function CreateRoomBody({
  values,
  onChange,
  books,
  booksLoading,
  booksError,
  onRetryBooks,
  paceHint,
  minor,
  disabled,
}: {
  values: CreateRoomValues;
  onChange: (v: Partial<CreateRoomValues>) => void;
  books: PickBook[];
  booksLoading?: boolean;
  booksError?: boolean;
  onRetryBooks?: () => void;
  /** "Finishes around 28 December" (null for Free or while the book is loading). */
  paceHint: string | null;
  minor?: boolean;
  disabled?: boolean;
}) {
  const { s } = useTheme();
  const [touched, setTouched] = useState(false);
  const nameErr = touched || values.name.length > 40 ? roomNameError(values.name) : null;
  return (
    <OnbSheet>
      <View style={{ paddingTop: s(22), paddingHorizontal: s(20), paddingBottom: s(24), gap: s(16) }}>
        <Field
          label="Room name"
          value={values.name}
          onChangeText={(name) => onChange({ name })}
          onBlur={() => setTouched(true)}
          error={nameErr ?? undefined}
          editable={!disabled}
          returnKeyType="done"
          maxLength={60}
        />
        <BookPicker
          books={books}
          loading={booksLoading}
          error={booksError}
          value={values.book}
          onChange={(book) => onChange({ book })}
          onRetry={onRetryBooks}
        />
        <View style={{ gap: s(8) }}>
          <Text variant="label" oneLine>
            Pace
          </Text>
          <Segmented options={PACES} value={values.pace} onChange={(pace) => onChange({ pace })} />
          {paceHint ? (
            <Text size={12} color="ink3">
              {`${paceHint}.`}
            </Text>
          ) : null}
        </View>
        <View style={{ gap: s(8) }}>
          <Text variant="label" oneLine>
            Who can join
          </Text>
          <Segmented
            options={JOINS}
            value={values.join}
            // Anyone rooms aren't open to under-18s (rule: minors).
            onChange={(join) => (join === 'anyone' && minor ? undefined : onChange({ join }))}
          />
          {minor ? (
            <Text size={12} color="ink3">
              Anyone rooms are for readers 18 and over.
            </Text>
          ) : null}
        </View>
      </View>
    </OnbSheet>
  );
}

export function CreateRoomHero({ onClose }: { onClose: () => void }) {
  return (
    <CloseHero
      title="Create a reading room"
      sub="Pick a book from your library. You'll get a code to invite friends."
      onClose={onClose}
    />
  );
}

export function CreateRoomFoot({
  enabled,
  busy,
  offline,
  note,
  onCreate,
}: {
  enabled: boolean;
  busy?: boolean;
  offline?: boolean;
  /** Message under the button: the host limit or "Couldn't create the room…". */
  note?: string | null;
  onCreate: () => void;
}) {
  return (
    <Foot>
      <Btn label="Create room" block disabled={!enabled || offline} loading={busy} onPress={onCreate} />
      {offline ? (
        <Text size={12} color="ink3" center>
          Connect to do this
        </Text>
      ) : (
        <FormError>{note}</FormError>
      )}
    </Foot>
  );
}

// ─── s-join-code ────────────────────────────────────────────────────────────
export function JoinCodeHero({ onClose }: { onClose: () => void }) {
  return (
    <CloseHero
      title="Join a reading room"
      sub="Enter the 8-character invite code from the person who invited you."
      onClose={onClose}
    />
  );
}

/** `.code-boxes`: eight 54-high boxes; a hidden field takes typing and paste. */
export function CodeBoxes({
  code,
  onChange,
  focused,
  onFocusChange,
  editable = true,
  autoFocus,
}: {
  code: string;
  onChange: (code: string) => void;
  focused?: boolean;
  onFocusChange?: (f: boolean) => void;
  editable?: boolean;
  autoFocus?: boolean;
}) {
  const { c, s, bw } = useTheme();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const active = Math.min(code.length, ROOM_CODE_LENGTH - 1);
  return (
    <View>
      <Press
        onPress={() => input.current?.focus()}
        pressScale={1}
        accessibilityLabel={`Room code, ${code.length} of ${ROOM_CODE_LENGTH} entered`}
        accessibilityHint="Double tap to type the code"
        style={{ flexDirection: 'row', gap: s(6) }}
      >
        {Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => {
          const on = !!focused && i === active;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                minHeight: s(54),
                borderRadius: s(12),
                backgroundColor: on ? c.white : c.surface,
                borderWidth: bw(1.5),
                borderColor: on ? c.org : c.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text size={20} weight={700} tabular oneLine>
                {code[i] ?? ''}
              </Text>
            </View>
          );
        })}
      </Press>
      <TextInput
        ref={input}
        value={code}
        // Any case, spaces and hyphens ignored, paste fills the boxes (rule 11).
        onChangeText={(t) => onChange(normaliseRoomCode(t))}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
        editable={editable}
        autoFocus={autoFocus}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        maxLength={40}
        importantForAccessibility="no"
        accessibilityElementsHidden
        caretHidden
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      />
    </View>
  );
}

export function JoinCodeBody({
  code,
  onChange,
  onPaste,
  error,
  focused,
  onFocusChange,
  busy,
  autoFocus,
}: {
  code: string;
  onChange: (c: string) => void;
  onPaste: () => void;
  error?: string | null;
  focused?: boolean;
  onFocusChange?: (f: boolean) => void;
  busy?: boolean;
  autoFocus?: boolean;
}) {
  const { s } = useTheme();
  return (
    <OnbSheet>
      <View style={{ paddingTop: s(22), paddingHorizontal: s(20), paddingBottom: s(24), gap: s(16) }}>
        <CodeBoxes
          code={code}
          onChange={onChange}
          focused={focused}
          onFocusChange={onFocusChange}
          editable={!busy}
          autoFocus={autoFocus}
        />
        {error ? (
          <Text size={13} weight={500} color="err" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          <Btn label="Paste code" icon="copy" variant="s" size="md" onPress={onPaste} disabled={busy} />
        </View>
      </View>
    </OnbSheet>
  );
}

export function JoinCodeFoot({
  filled,
  busy,
  offline,
  onJoin,
}: {
  filled: number;
  busy?: boolean;
  offline?: boolean;
  onJoin: () => void;
}) {
  return (
    <Foot>
      <Btn
        label={joinButtonLabel(filled)}
        block
        disabled={filled < ROOM_CODE_LENGTH || offline}
        loading={busy}
        onPress={onJoin}
      />
      {offline ? (
        <Text size={12} color="ink3" center>
          Connect to do this
        </Text>
      ) : null}
    </Foot>
  );
}

/** The consent line shown once per room (rule 14), inside a kit Sheet. */
export function ConsentBody({
  book,
  blockedWarning,
  busy,
  onJoin,
  onCancel,
}: {
  book: string;
  blockedWarning?: boolean;
  busy?: boolean;
  onJoin: () => void;
  onCancel: () => void;
}) {
  const { s } = useTheme();
  return (
    <>
      <Text size={15} style={{ lineHeight: s(15) * 1.45 }}>
        {`Everyone in this room can see how far you are in ${book}.`}
      </Text>
      {blockedWarning ? (
        <Text size={13.5} color="ink2" style={{ lineHeight: s(13.5) * 1.45 }}>
          Someone you blocked is in this room. You will see their progress, but not their messages.
        </Text>
      ) : null}
      <View style={{ gap: s(8) }}>
        <Btn label="Join" block loading={busy} onPress={onJoin} />
        <Btn label="Cancel" variant="g" block disabled={busy} onPress={onCancel} />
      </View>
    </>
  );
}
