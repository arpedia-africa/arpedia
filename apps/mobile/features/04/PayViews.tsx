// Flow 04 money sheets in the reader, one to one with the prototype: s-pay-rest (.kv, .pay-perks,
// one spend button) and s-reader-chapter-low (.t-sm.t-soft, .option-list of packs, top up, Library).
// Pure views: the reader screen passes data and handlers. The sheet head is the kit Sheet with `bold`.
import { View } from 'react-native';
import { formatNaira, packBooks, type TopupPack } from '@arpedia/core';
import { Btn, Callout, KeyValue, Press, Text, useTheme } from '@arpedia/ui';

const n = (v: number) => v.toLocaleString('en-NG');

/** `.pay-perks`: list with small main-colour dots. */
function Perks({ items }: { items: string[] }) {
  const { c, s } = useTheme();
  return (
    <View style={{ gap: s(6) }}>
      {items.map((t) => (
        <View key={t} style={{ flexDirection: 'row', gap: s(10), alignItems: 'center' }}>
          <View style={{ width: s(6), height: s(6), borderRadius: 999, backgroundColor: c.org }} />
          <Text size={13.5} color="ink2" style={{ flex: 1 }}>
            {t}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** s-pay-rest body: book price, already paid, left to pay; perks; Pay {left} credits (rule 61). */
export function PayRestBody({
  price,
  paid,
  paidLabel,
  left,
  busy,
  error,
  onPay,
}: {
  price: number;
  paid: number;
  /** "Already paid · chapters 2 to 4" */
  paidLabel: string;
  left: number;
  busy?: boolean;
  error?: string | null;
  onPay: () => void;
}) {
  return (
    <>
      <KeyValue
        rows={[
          { k: 'Book price', v: `${n(price)} credits` },
          { k: paidLabel, v: `− ${n(paid)}` },
          { k: 'Left to pay', v: `${n(left)} credits`, total: true },
        ]}
      />
      <Perks items={['The whole book downloads for offline reading', 'No more chapter stops']} />
      {error ? <Callout tone="err">{error}</Callout> : null}
      <Btn label={`Pay ${n(left)} credits`} block loading={busy} onPress={onPay} />
    </>
  );
}

/** `.option.option--compact` with a `.radio`. */
function PackOption({
  title,
  sub,
  trail,
  selected,
  onPress,
}: {
  title: string;
  sub: string;
  trail: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { c, s } = useTheme();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        paddingVertical: s(12),
        paddingHorizontal: s(14),
        minHeight: s(48),
        borderRadius: s(14),
        borderWidth: 1,
        borderColor: selected ? 'transparent' : c.line,
        backgroundColor: selected ? c.orgTint2 : c.white,
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
      <View
        style={{
          width: s(22),
          height: s(22),
          borderRadius: 999,
          borderWidth: selected ? s(7) : s(2),
          borderColor: selected ? c.org : c.control,
        }}
      />
      <View style={{ flex: 1, gap: s(2) }}>
        <Text size={15.5} weight={700} oneLine>
          {title}
        </Text>
        <Text size={13} color="ink2" oneLine>
          {sub}
        </Text>
      </View>
      <Text size={16} weight={700} tabular oneLine>
        {trail}
      </Text>
    </Press>
  );
}

/**
 * s-reader-chapter-low body (rule 60): the place is saved, when the plan adds credits, the three
 * packs (smallest that covers the chapter preselected), Top up, Read something already unlocked.
 */
export function ChapterLowBody({
  copy,
  packs,
  selected,
  presetSub,
  onSelect,
  onTopUp,
  onLibrary,
}: {
  copy: string;
  packs: readonly TopupPack[];
  selected: TopupPack;
  /** Sub line on the preselected pack ("The rest of this book and more"); others show "≈ n books". */
  presetSub: { credits: number; sub: string } | null;
  onSelect: (p: TopupPack) => void;
  onTopUp: () => void;
  onLibrary: () => void;
}) {
  const { s } = useTheme();
  return (
    <>
      <Text size={13.5} color="ink2" style={{ lineHeight: s(13.5) * 1.45 }}>
        {copy}
      </Text>
      <View style={{ gap: s(10) }} accessibilityRole="radiogroup">
        {packs.map((p) => (
          <PackOption
            key={p.credits}
            title={`${n(p.credits)} credits`}
            sub={presetSub?.credits === p.credits ? presetSub.sub : `≈ ${packBooks(p.credits)} books`}
            trail={formatNaira(p.naira)}
            selected={selected.credits === p.credits}
            onPress={() => onSelect(p)}
          />
        ))}
      </View>
      <Btn
        label={`Top up ${n(selected.credits)} credits · ${formatNaira(selected.naira)}`}
        block
        onPress={onTopUp}
      />
      <Btn label="Read something already unlocked" variant="g" size="md" block onPress={onLibrary} />
    </>
  );
}
