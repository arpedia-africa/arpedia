import { View } from 'react-native';
import { formatNaira, packBooks, type TopupPack } from '@arpedia/core';
import { Btn, Callout, KeyValue, Press, Segmented, Text, Toggle, useTheme } from '@arpedia/ui';

// Sheet bodies for s-unlock, s-unlock-paygo, s-unlock-low and s-unlock-nosub. Pure views for
// UnlockSheet and tools/parity (`node tools/screen.mjs s-unlock s-unlock-low --css`).
// The sheet head (title, sub) is the kit Sheet with `bold`.

const n = (v: number) => v.toLocaleString('en-NG');

export type UnlockMode = 'all' | 'paygo';

/** `.seg`: Unlock all / Pay as you read, switches without closing the sheet (rule 16). */
export function ModeSwitch({ value, onChange }: { value: UnlockMode; onChange: (m: UnlockMode) => void }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        { value: 'all', label: 'Unlock all' },
        { value: 'paygo', label: 'Pay as you read' },
      ]}
    />
  );
}

/** `.t-sm.t-soft` paragraph. */
export function Soft({ children }: { children: string }) {
  const { s } = useTheme();
  return (
    <Text size={13.5} color="ink2" style={{ lineHeight: s(13.5) * 1.45 }}>
      {children}
    </Text>
  );
}

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

/** s-unlock body: balance, price, after; perks; the spend button. "Pay the rest" when chapters are paid. */
export function UnlockAllBody({
  balance,
  price,
  paid,
  remaining,
  author,
  onMode,
  onUnlock,
  busy,
  error,
  showSwitch = true,
}: {
  balance: number;
  price: number;
  /** Credits already paid for chapters (rule 18). */
  paid: number;
  /** What unlock_book charges for the rest (capped at the pay-as-you-read snapshot); defaults to price − paid. */
  remaining?: number;
  author: string;
  onMode: (m: UnlockMode) => void;
  onUnlock: () => void;
  busy?: boolean;
  error?: string | null;
  showSwitch?: boolean;
}) {
  const left = Math.max(0, remaining ?? price - paid);
  const rows =
    paid > 0
      ? [
          { k: 'Price', v: `${n(paid + left)} credits` },
          { k: 'Already paid', v: `− ${n(paid)}` },
          { k: 'Left to pay', v: `${n(left)} credits`, total: true },
        ]
      : [
          { k: 'Your balance', v: `${n(balance)} credits` },
          { k: 'This book', v: `− ${n(price)}` },
          { k: 'After unlock', v: `${n(Math.max(0, balance - price))} credits`, total: true },
        ];
  return (
    <>
      {showSwitch && paid === 0 ? <ModeSwitch value="all" onChange={onMode} /> : null}
      <KeyValue rows={rows} />
      <Perks
        items={[
          'The whole book downloads for offline reading',
          `${author.split(' ')[0]} is paid in full today`,
          'Yours to keep, even if you cancel your plan',
        ]}
      />
      {error ? <Callout tone="err">{error}</Callout> : null}
      <Btn
        label={paid > 0 ? `Pay ${n(left)} credits` : `Unlock for ${n(price)} credits`}
        block
        loading={busy}
        onPress={onUnlock}
      />
    </>
  );
}

/** s-unlock-paygo body: free preview, per chapter, most you'll pay; Auto-unlock switch. Spends nothing. */
export function PayGoBody({
  previewPercent,
  previewPages,
  perChapter,
  price,
  autoUnlock,
  onAutoUnlock,
  onMode,
  onStart,
  showSwitch = true,
}: {
  previewPercent: number;
  previewPages: number;
  perChapter: number;
  price: number;
  autoUnlock: boolean;
  onAutoUnlock: (v: boolean) => void;
  onMode: (m: UnlockMode) => void;
  onStart: () => void;
  showSwitch?: boolean;
}) {
  const { s } = useTheme();
  return (
    <>
      {showSwitch ? <ModeSwitch value="paygo" onChange={onMode} /> : null}
      <KeyValue
        rows={[
          { k: `First ${previewPercent}% (about ${n(previewPages)} pages)`, v: 'Free' },
          { k: 'Each chapter after that', v: `About ${n(perChapter)} credits` },
          { k: 'Most you’ll ever pay', v: `${n(price)} credits`, total: true },
        ]}
      />
      <Soft>
        We take a chapter’s credits when you turn past its first page. Re-reading is free, and you can pay the
        rest whenever you like.
      </Soft>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
        <View style={{ flex: 1, gap: s(4) }}>
          <Text size={15} weight={600} oneLine style={{ lineHeight: s(15) * 1.3 }}>
            Auto-unlock next chapter
          </Text>
          <Text size={12} color="ink3" oneLine style={{ lineHeight: s(12) * 1.4 }}>
            Off: we ask at the start of each chapter
          </Text>
        </View>
        <Toggle value={autoUnlock} onChange={onAutoUnlock} label="Auto-unlock next chapter" />
      </View>
      <Btn label="Start reading" block onPress={onStart} />
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
      {/* .is-selected: inset 2px ring inside the (transparent) border, so nothing moves */}
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

/** s-unlock-low body: book and balance, when credits come, the packs, Buy. Nothing is spent here. */
export function LowBody({
  bookLine,
  price,
  balance,
  copy,
  packs,
  avgBookPrice,
  selected,
  enough,
  onSelect,
  onBuy,
}: {
  /** "Seven Bridges to Jos · 392 pages" */
  bookLine: string;
  price: number;
  balance: number;
  copy: string;
  packs: readonly TopupPack[];
  /** Credits a typical book costs ('≈ N books'), from get_plans. */
  avgBookPrice?: number;
  selected: TopupPack;
  /** The preselected pack covers what's missing ("Enough for this book"). */
  enough: TopupPack | null;
  onSelect: (p: TopupPack) => void;
  onBuy: () => void;
}) {
  const { s } = useTheme();
  return (
    <>
      <KeyValue
        rows={[
          { k: bookLine, v: `${n(price)} credits` },
          { k: 'Your balance', v: `${n(balance)} credits` },
        ]}
      />
      <Soft>{copy}</Soft>
      <View style={{ gap: s(10) }} accessibilityRole="radiogroup">
        {packs.map((p) => (
          <PackOption
            key={p.credits}
            title={`${n(p.credits)} credits`}
            sub={
              enough?.credits === p.credits
                ? 'Enough for this book'
                : `≈ ${packBooks(p.credits, avgBookPrice)} books`
            }
            trail={formatNaira(p.naira)}
            selected={selected.credits === p.credits}
            onPress={() => onSelect(p)}
          />
        ))}
      </View>
      <Btn
        label={`Buy ${n(selected.credits)} credits · ${formatNaira(selected.naira)}`}
        block
        onPress={onBuy}
      />
    </>
  );
}

/** s-unlock-nosub body: credits come with a plan; free 10% callout; plans and keep reading. */
export function NoSubBody({
  copy,
  previewPercent,
  fromNaira,
  onPlans,
  onRead,
}: {
  copy: string;
  previewPercent: number;
  fromNaira: number;
  onPlans: () => void;
  onRead: () => void;
}) {
  return (
    <>
      <Soft>{copy}</Soft>
      <Callout tone="brand">{`The first ${previewPercent}% of every book stays free, with or without a plan.`}</Callout>
      <Btn label={`See plans from ${formatNaira(fromNaira)} a month`} block onPress={onPlans} />
      <Btn label={`Keep reading the free ${previewPercent}%`} variant="g" size="md" block onPress={onRead} />
    </>
  );
}
