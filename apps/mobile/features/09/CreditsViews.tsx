import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { BOOK_CREDITS, formatNaira, ledgerDate, ledgerDay } from '@arpedia/core';
import {
  Btn,
  Callout,
  Cell,
  EmptyState,
  Field,
  Group,
  Hero,
  IconButton,
  Pill,
  Press,
  Section,
  Skeleton,
  Text,
  useTheme,
} from '@arpedia/ui';
import { HeroSub } from '../01/parts';
import {
  booksLabel,
  dayMonth,
  n,
  packPrice,
  periodWord,
  type BalanceJson,
  type HistoryLine,
  type PlanJson,
  type TopupJson,
} from './data';
import { OfflineNote, OptionRow, OptionSkeleton } from './parts';

// s-credits (`node tools/screen.mjs s-credits --css`).

// ─── Hero ───────────────────────────────────────────────────────────────────
/** `.hero-panel`: 88% white, radius 14, padding 12 14; `.stat__value` 20/800 and a `.t-xs` line. */
function Panel({ value, label }: { value: string; label: string }) {
  const { s } = useTheme();
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: '45%',
        backgroundColor: 'rgba(255,255,255,0.88)',
        borderRadius: s(14),
        paddingVertical: s(12),
        paddingHorizontal: s(14),
        gap: s(2),
      }}
    >
      <Text family="display" weight={800} size={20} tabular oneLine style={{ lineHeight: s(20) * 1.1 }}>
        {value}
      </Text>
      <Text size={12} color="ink2" style={{ lineHeight: s(12) * 1.4 }}>
        {label}
      </Text>
    </View>
  );
}

export function CreditsHero({
  balance,
  plan,
  onBack,
  onPlan,
}: {
  /** Null while loading. */
  balance: BalanceJson | null;
  plan: PlanJson | null;
  onBack: () => void;
  onPlan: () => void;
}) {
  const { c, s } = useTheme();
  const per = plan ? periodWord(plan.months) : 'period';
  const sub = !balance
    ? ''
    : balance.books >= 1
      ? `≈ ${balance.books} ${balance.books === 1 ? 'book' : 'books'}. Unlock a whole book or pay as you read, chapter by chapter.`
      : 'Unlock a whole book or pay as you read, chapter by chapter.';
  return (
    <Hero
      barBack
      bar={
        <>
          <IconButton icon="back" label="Back" onPress={onBack} color={c.onOrg} />
          <View style={{ flex: 1 }} />
          <Press onPress={onPlan} accessibilityRole="link" accessibilityLabel="Your plan" hitSlop={s(8)}>
            <Pill tone="night" iconName="cal" label="Your plan" />
          </Press>
        </>
      }
    >
      <Text size={13} weight={600} color="onOrg">
        Available balance
      </Text>
      {balance ? (
        <Text
          family="display"
          weight={800}
          size={52}
          color="onOrg"
          tabular
          oneLine
          accessibilityLabel={`${n(balance.total)} credits`}
          style={{ letterSpacing: s(52) * -0.03, lineHeight: s(52) * 0.95 }}
        >
          {n(balance.total)}
          <Text family="display" weight={800} size={20} color="onOrg" style={{ letterSpacing: 0 }}>
            {' credits'}
          </Text>
        </Text>
      ) : (
        <Skeleton width={s(160)} height={50} radius={10} />
      )}
      {balance ? <HeroSub>{sub}</HeroSub> : <Skeleton width="70%" height={14} />}
      {balance ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(8) }}>
          <Panel
            value={n(balance.plan)}
            label={
              balance.plan_expires_at
                ? `This ${per} · refills ${dayMonth(balance.plan_expires_at)}`
                : `This ${per}`
            }
          />
          <Panel
            value={n(balance.rollover)}
            label={
              balance.rollover > 0 && balance.rollover_expires_at
                ? `Rolled over · use by ${dayMonth(balance.rollover_expires_at)}`
                : 'Rolled over'
            }
          />
          {balance.topup > 0 ? <Panel value={n(balance.topup)} label="Top-up · never expires" /> : null}
          {balance.promo > 0 ? <Panel value={n(balance.promo)} label="Promo bonus" /> : null}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: s(8) }}>
          <Skeleton height={70} radius={14} style={{ flex: 1 }} />
          <Skeleton height={70} radius={14} style={{ flex: 1 }} />
        </View>
      )}
    </Hero>
  );
}

// ─── Sections ───────────────────────────────────────────────────────────────
/** `.section__head` with a right-hand `.t-sm.t-soft` note (the kit's Section only takes a link). */
function Head({ title, note }: { title: string; note?: string }) {
  const { s } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: s(12),
        paddingHorizontal: s(16),
        paddingBottom: s(12),
      }}
    >
      <Text variant="h3" oneLine style={{ lineHeight: s(18) * 1.45, flexShrink: 1 }}>
        {title}
      </Text>
      {note ? (
        <Text size={13.5} color="ink2" oneLine>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const Inset = ({ children }: { children: ReactNode }) => {
  const { s } = useTheme();
  return <View style={{ paddingHorizontal: s(16), gap: s(12) }}>{children}</View>;
};

/** "Top up": packs and Buy for subscribers; for everyone else one sentence and See plans. */
export function TopUpSection({
  mode,
  packs,
  selected,
  onSelect,
  plan,
  busy,
  offline,
  onBuy,
  onPlans,
}: {
  /** 'plan': may top up · 'paused': plan paused · 'none': no plan · 'loading' */
  mode: 'plan' | 'paused' | 'none' | 'loading';
  packs: TopupJson[];
  selected: string;
  onSelect: (code: string) => void;
  plan: PlanJson | null;
  busy: boolean;
  offline: boolean;
  onBuy: () => void;
  onPlans: () => void;
}) {
  const { s } = useTheme();
  const pick = packs.find((p) => p.code === selected) ?? packs[0];
  if (mode === 'loading') {
    return (
      <Section>
        <Head title="Top up" />
        <Inset>
          <OptionSkeleton />
          <OptionSkeleton />
          <OptionSkeleton />
        </Inset>
      </Section>
    );
  }
  if (mode !== 'plan' || !pick) {
    return (
      <Section>
        <Head title="Top up" note="₦3 a credit · for subscribers" />
        <Inset>
          <Callout tone="quiet">
            {mode === 'paused'
              ? 'Top-ups are off while your plan is paused. Your credits are safe.'
              : 'Top-ups are for subscribers. See plans'}
          </Callout>
          <Btn label={mode === 'paused' ? 'Your plan' : 'See plans'} block onPress={onPlans} />
        </Inset>
      </Section>
    );
  }
  const cap = plan ? plan.total_credits : null;
  return (
    <Section>
      <Head title="Top up" note="₦3 a credit · for subscribers" />
      <Inset>
        <View accessibilityRole="radiogroup" style={{ gap: s(10) }}>
          {packs.map((p) => (
            <OptionRow
              key={p.code}
              title={`${n(p.credits)} credits`}
              sub={booksLabel(p.credits, BOOK_CREDITS)}
              trail={packPrice(p)}
              selected={p.code === pick.code}
              onPress={() => onSelect(p.code)}
            />
          ))}
        </View>
        <Text size={12.5} color="ink2">
          {plan && cap
            ? `Unused credits roll over for one more ${periodWord(plan.months)}, up to ${n(cap)}. Books you unlock stay yours for good, even if you cancel.`
            : 'Unused plan credits roll over for one more period, up to one plan’s worth. Books you unlock stay yours for good, even if you cancel.'}
        </Text>
        <Btn
          label={`Buy ${n(pick.credits)} credits · ${packPrice(pick)}`}
          block
          loading={busy}
          disabled={offline}
          onPress={onBuy}
        />
        {offline ? <OfflineNote /> : null}
      </Inset>
    </Section>
  );
}

/** Default Q15: the in-app promo box is a field on s-credits. */
export function PromoSection({
  value,
  onChange,
  error,
  busy,
  offline,
  onRedeem,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  busy: boolean;
  offline: boolean;
  onRedeem: () => void;
}) {
  return (
    <Section>
      <Head title="Promo code" />
      <Inset>
        <Field
          placeholder="Enter your code"
          value={value}
          onChangeText={onChange}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={16}
          returnKeyType="done"
          onSubmitEditing={onRedeem}
          error={error ?? undefined}
          accessibilityLabel="Promo code"
        />
        <Btn
          label="Redeem"
          variant="s"
          block
          loading={busy}
          disabled={offline || !value.trim()}
          onPress={onRedeem}
        />
        {offline ? <OfflineNote /> : null}
      </Inset>
    </Section>
  );
}

/** "What credits buy": four plain rows (rule 15). */
export function BuySection({
  bookPrice,
  messageCost,
  tipFrom,
}: {
  bookPrice: number;
  messageCost: number;
  tipFrom: number;
}) {
  const trail = (text: string, num?: boolean) => (
    <Text size={13} weight={700} color="ink3" tabular={num} oneLine>
      {text}
    </Text>
  );
  return (
    <Section>
      <Head title="What credits buy" />
      <Group>
        <Cell
          title="Books"
          sub={`Half a credit a page · a 250-page book is ${n(bookPrice)}`}
          trail={trail('All at once or as you read')}
        />
        <Cell title="Messages to authors" sub="Replies are free" trail={trail(`${messageCost} each`, true)} />
        <Cell
          title="Tips"
          sub="₦1.60 of each credit reaches the author"
          trail={trail(`From ${tipFrom}`, true)}
        />
        <Cell title="Gifts" sub="A book for a friend" trail={trail('Book price')} />
      </Group>
    </Section>
  );
}

// ─── Transactions ───────────────────────────────────────────────────────────
const sign = (d: number) => (d > 0 ? '+' : '−');
const amount = (d: number, unit = true) => `${sign(d)}${n(Math.abs(d))}${unit ? ' cr' : ''}`;
/** "13 Nov, 21:40": the chapter lines drop the year. */
const shortDate = (iso: string) => ledgerDate(iso).replace(/ \d{4},/, ',');

/** Title and date line for one history line that is not a book group. */
function describe(l: HistoryLine): { title: string; sub: string } {
  const who = l.detail.counterparty;
  const book = l.title;
  const full = ledgerDate(l.at);
  switch (l.kind) {
    case 'plan_grant':
      return { title: 'Plan credits', sub: ledgerDay(l.at) };
    case 'rollover':
      return { title: 'Rolled over from last period', sub: `${ledgerDay(l.at)} · unused credits carried in` };
    case 'expiry':
      return { title: 'Credits expired', sub: ledgerDay(l.at) };
    case 'top_up':
      return { title: `Top-up · ${n(Math.abs(l.delta))} credits`, sub: full };
    case 'unlock_all':
      return { title: `Unlocked all · ${book ?? 'a book'}`, sub: full };
    case 'tip':
      return { title: who ? `Tip to ${who}` : `Tip · ${book ?? 'an author'}`, sub: full };
    case 'message':
      return { title: `Message to ${who ?? 'an author'}`, sub: full };
    case 'gift_out':
      return { title: `Gift · ${book ?? 'a book'}`, sub: full };
    case 'gift_in':
      return { title: who ? `Gift from ${who}` : 'Gift received', sub: full };
    case 'refund':
      return { title: 'Refund', sub: full };
    case 'staff_adjust':
      return { title: l.detail.note || 'Adjustment by Arpedia', sub: full };
    case 'promo':
      return { title: 'Promo credits', sub: full };
    case 'undo':
      return { title: 'Chapter charge returned', sub: full };
    default:
      return { title: 'Credit activity', sub: full };
  }
}

/** A `.cell` of the history: title (500), date, signed amount; `child` = `.cell--child`. */
function TxCell({
  title,
  sub,
  delta,
  unit = true,
  child,
  parent,
  expanded,
  onPress,
}: {
  title: string;
  sub: string;
  delta: number;
  unit?: boolean;
  child?: boolean;
  /** A book group: bold title, taps to expand. */
  parent?: boolean;
  expanded?: boolean;
  onPress?: () => void;
}) {
  const { s } = useTheme();
  const body = (
    <>
      <View style={{ flex: 1, minWidth: 0, gap: s(2) }}>
        <Text
          size={child ? 13.5 : 14.5}
          weight={parent ? 600 : 500}
          ellipsis
          style={{ lineHeight: s(child ? 13.5 : 14.5) * 1.3 }}
        >
          {title}
        </Text>
        <Text size={12.5} color="ink3" style={{ lineHeight: s(12.5) * 1.35 }}>
          {sub}
        </Text>
      </View>
      {/* No chevron on the book row: no icons in list rows (the prototype has none). */}
      <Text
        size={child ? 13 : 14}
        weight={700}
        tabular
        oneLine
        color={child ? 'ink2' : delta > 0 ? 'ok' : 'err'}
      >
        {amount(delta, unit)}
      </Text>
    </>
  );
  const style = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: s(12),
    minHeight: s(child ? 40 : 56),
    paddingVertical: s(child ? 6 : 12),
    paddingLeft: s(child ? 32 : 14),
    paddingRight: s(14),
  };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Press
      onPress={onPress}
      pressScale={0.99}
      accessibilityState={{ expanded: !!expanded }}
      accessibilityLabel={`${title}, ${sub}, ${amount(delta)}`}
      style={style}
    >
      {body}
    </Press>
  );
}

/** One book's pay-as-you-read charges as one line, expandable to chapters (rule 14). */
function BookGroup({ line, open, onToggle }: { line: HistoryLine; open: boolean; onToggle: () => void }) {
  const { paid = 0, price, items = [] } = line.detail;
  return (
    <Group>
      <TxCell
        parent
        expanded={open}
        title={line.title ?? 'A book'}
        sub={`Pay as you read · ${n(paid)}${price ? ` of ${n(price)}` : ''} paid`}
        delta={line.delta}
        onPress={onToggle}
      />
      {open
        ? items.map((it) => (
            <TxCell
              key={it.id}
              child
              unit={false}
              title={`${it.chapter ?? 'Chapter'}${it.reason === 'undo' ? ' · returned' : ''}`}
              sub={shortDate(it.at)}
              delta={it.delta}
            />
          ))
        : null}
    </Group>
  );
}

export function HistorySection({
  lines,
  hasMore,
  loadingMore,
  onMore,
}: {
  lines: HistoryLine[];
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
}) {
  const { s } = useTheme();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const books = lines.filter((l) => l.kind === 'book_chapters');
  const rest = lines.filter((l) => l.kind !== 'book_chapters');
  const firstBook = books[0]?.key;
  return (
    <Section style={{ paddingBottom: s(28) }}>
      <Head title="Transactions" />
      {lines.length === 0 ? (
        <EmptyState title="Your credit history will show up here" />
      ) : (
        <View style={{ gap: s(12) }}>
          {books.map((l) => (
            <BookGroup
              key={l.key}
              line={l}
              open={open[l.key] ?? l.key === firstBook}
              onToggle={() => setOpen((o) => ({ ...o, [l.key]: !(o[l.key] ?? l.key === firstBook) }))}
            />
          ))}
          {rest.length ? (
            <Group>
              {rest.map((l) => {
                const d = describe(l);
                return <TxCell key={l.key} title={d.title} sub={d.sub} delta={l.delta} />;
              })}
            </Group>
          ) : null}
          {hasMore ? (
            <View style={{ paddingHorizontal: s(16) }}>
              <Btn label="Show earlier" variant="s" size="md" block loading={loadingMore} onPress={onMore} />
            </View>
          ) : null}
        </View>
      )}
    </Section>
  );
}

/** Loading: three rows where the history will be. */
export function HistorySkeleton() {
  const { s } = useTheme();
  return (
    <Section style={{ paddingBottom: s(28) }}>
      <Head title="Transactions" />
      <View style={{ paddingHorizontal: s(16), gap: s(10) }}>
        <Skeleton height={56} radius={14} />
        <Skeleton height={56} radius={14} />
        <Skeleton height={56} radius={14} />
      </View>
    </Section>
  );
}

/** Whole-screen failure (States: Error and Offline with nothing cached). */
export function CreditsFailed({ offline, onRetry }: { offline: boolean; onRetry: () => void }) {
  return (
    <EmptyState
      title="Your credits didn’t load"
      body={
        offline ? 'You’re offline. Connect and try again.' : 'Something went wrong on our side. Try again.'
      }
      action={{ label: 'Try again', onPress: onRetry }}
    />
  );
}
