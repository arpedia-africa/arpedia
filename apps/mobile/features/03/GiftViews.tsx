import { View } from 'react-native';
import { NOTE_MAX } from '@arpedia/core';
import { Avatar, Btn, Callout, Field, Press, Skeleton, Text, useTheme, type AvatarTone } from '@arpedia/ui';

// Sheet bodies for s-gift and s-tip. Pure views for GiftSheet and tools/parity
// (`node tools/screen.mjs s-gift s-tip --css`). The head is the kit Sheet with `bold`.

const n = (v: number) => v.toLocaleString('en-NG');

export interface GiftPerson {
  id: string;
  name: string;
  /** "Follows you", "In Grace Readers" */
  why: string;
  hasIt: boolean;
  tone?: AvatarTone;
}

/** `.radio`: 22px; selected = 7px main-colour ring. */
function Radio({ on }: { on: boolean }) {
  const { c, s } = useTheme();
  return (
    <View
      style={{
        width: s(22),
        height: s(22),
        borderRadius: 999,
        borderWidth: on ? s(7) : s(2),
        borderColor: on ? c.org : '#D1D5DB',
      }}
    />
  );
}

/** `.option-list--flush .option`: a person row; no border radius, rules between rows. */
function PersonRow({
  p,
  selected,
  first,
  onPress,
}: {
  p: GiftPerson;
  selected: boolean;
  first: boolean;
  onPress: () => void;
}) {
  const { c, s } = useTheme();
  return (
    <Press
      onPress={onPress}
      disabled={p.hasIt}
      pressScale={0.99}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: p.hasIt }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        paddingVertical: s(14),
        paddingHorizontal: s(16),
        minHeight: s(56),
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.line,
        backgroundColor: selected ? c.orgTint2 : c.white,
        opacity: p.hasIt ? 0.5 : 1,
      }}
    >
      {selected ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', inset: 0, borderWidth: s(2), borderColor: c.org }}
        />
      ) : null}
      <Avatar name={p.name} size="sm" tone={p.tone ?? 't'} />
      <View style={{ flex: 1, gap: s(2) }}>
        <Text size={15.5} weight={700} ellipsis numberOfLines={1}>
          {p.name}
        </Text>
        <Text size={13} color="ink2" oneLine>
          {p.hasIt ? 'Already has it' : p.why}
        </Text>
      </View>
      {p.hasIt ? null : <Radio on={selected} />}
    </Press>
  );
}

/** s-gift body: search, people, message, Send. */
export function GiftBody({
  query,
  onQuery,
  people,
  loading,
  selected,
  onSelect,
  message,
  onMessage,
  price,
  onSend,
  busy,
  error,
  disabled,
}: {
  query: string;
  onQuery: (q: string) => void;
  people: GiftPerson[];
  loading?: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  message: string;
  onMessage: (m: string) => void;
  price: number;
  onSend: () => void;
  busy?: boolean;
  error?: string | null;
  disabled?: boolean;
}) {
  const { s } = useTheme();
  return (
    <>
      <Field
        icon="search"
        placeholder="Search friends"
        accessibilityLabel="Search friends"
        value={query}
        onChangeText={onQuery}
        autoCorrect={false}
      />
      {/* .pb .option-list--flush: full width, out to the panel edges */}
      <View style={{ marginHorizontal: s(-18) }}>
        {loading ? (
          <View style={{ gap: s(10), paddingHorizontal: s(18) }}>
            <Skeleton height={s(56)} radius={s(12)} />
            <Skeleton height={s(56)} radius={s(12)} />
          </View>
        ) : people.length === 0 ? (
          <Text size={13.5} color="ink2" style={{ paddingHorizontal: s(18), lineHeight: s(13.5) * 1.45 }}>
            {query
              ? `No one called “${query}” follows you yet.`
              : 'People who follow you show here. When someone follows you, you can gift them a book.'}
          </Text>
        ) : (
          people.map((p, i) => (
            <PersonRow
              key={p.id}
              p={p}
              first={i === 0}
              selected={selected === p.id}
              onPress={() => onSelect(p.id)}
            />
          ))
        )}
      </View>
      <Field
        label="Message"
        placeholder="Add a message (optional)"
        value={message}
        onChangeText={onMessage}
        maxLength={NOTE_MAX}
        hint={message.length > NOTE_MAX - 20 ? `${message.length}/${NOTE_MAX}` : undefined}
      />
      {error ? <Callout tone="err">{error}</Callout> : null}
      <Btn
        label={`Send gift · ${n(price)} credits`}
        block
        loading={busy}
        disabled={disabled || !selected}
        onPress={onSend}
      />
    </>
  );
}

/** `.amount`: one preset in the 3-column grid. */
function Amount({ value, selected, onPress }: { value: number; selected: boolean; onPress: () => void }) {
  const { c, s } = useTheme();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${value} credits`}
      style={{
        flex: 1,
        minHeight: s(68),
        borderRadius: s(14),
        borderWidth: 1,
        borderColor: selected ? 'transparent' : c.line,
        backgroundColor: selected ? c.orgTint2 : c.white,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {selected ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: s(14) - 1,
            borderWidth: s(2),
            borderColor: c.org,
          }}
        />
      ) : null}
      <Text variant="display" size={22} weight={800} tabular oneLine style={{ lineHeight: s(22) }}>
        {String(value)}
      </Text>
      <Text size={11.5} color="ink3" oneLine>
        credits
      </Text>
    </Press>
  );
}

/** s-tip body: presets, note, Send. */
export function TipBody({
  presets,
  amount,
  onAmount,
  note,
  onNote,
  onSend,
  busy,
  error,
  disabled,
}: {
  presets: readonly number[];
  amount: number;
  onAmount: (v: number) => void;
  note: string;
  onNote: (v: string) => void;
  onSend: () => void;
  busy?: boolean;
  error?: string | null;
  disabled?: boolean;
}) {
  const { s } = useTheme();
  return (
    <>
      <View style={{ flexDirection: 'row', gap: s(8) }} accessibilityRole="radiogroup">
        {presets.map((v) => (
          <Amount key={v} value={v} selected={amount === v} onPress={() => onAmount(v)} />
        ))}
      </View>
      <Field
        placeholder="Add a note (optional)"
        accessibilityLabel="Note"
        value={note}
        onChangeText={onNote}
        maxLength={NOTE_MAX}
        hint={note.length > NOTE_MAX - 20 ? `${note.length}/${NOTE_MAX}` : undefined}
      />
      {error ? <Callout tone="err">{error}</Callout> : null}
      <Btn label={`Send ${n(amount)} credits`} block loading={busy} disabled={disabled} onPress={onSend} />
    </>
  );
}
