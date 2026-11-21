import { View } from 'react-native';
import { Btn, Link, Segmented, Text, useTheme } from '@arpedia/ui';
import { OnbSheet } from '../01/parts';
import { BuySection, CreditsHero, HistorySection, TopUpSection } from './CreditsViews';
import type { BalanceJson, HistoryItem, HistoryLine, PlanJson, SubscriptionJson, TopupJson } from './data';
import { Foot, SubPad } from './parts';
import { CancelHero, CancelSummary, CheckoutBody, CheckoutHero, PlanBody, PlanHero } from './PlanViews';

// Flow 09 parity screens for `node tools/parity.mjs` (tools/parity/s-credits.html and friends), with
// the prototype's values. The Promo code section (Default Q15) is not in the prototype, so s-credits
// leaves it out here.

const PAGES09 = ['s-credits', 's-plans', 's-checkout', 's-plan-cancel'] as const;
export type Page09 = (typeof PAGES09)[number];
export const isFlow09 = (p: string): p is Page09 => (PAGES09 as readonly string[]).includes(p);

const plan = (
  code: PlanJson['code'],
  name: string,
  months: number,
  credits: number,
  naira: number,
  badge: string | null,
): PlanJson => ({
  code,
  name,
  months,
  credits,
  bonus_credits: 0,
  total_credits: credits,
  price_play_kobo: naira * 100,
  price_web_kobo: naira * 100,
  play_product_id: null,
  badge,
  active: true,
  sort: months,
});

const MONTHLY = plan('monthly', 'Monthly', 1, 300, 900, null);
const QUARTERLY = plan('quarterly', 'Quarterly', 3, 800, 2400, 'Most popular');
const YEARLY = plan('yearly', 'Yearly', 12, 3000, 8400, 'Best value');
const PLANS = [MONTHLY, QUARTERLY, YEARLY];

const RENEWS = '2027-02-12T09:00:00+01:00';

const BALANCE: BalanceJson = {
  total: 840,
  plan: 800,
  rollover: 40,
  topup: 0,
  promo: 0,
  books: 6,
  plan_expires_at: RENEWS,
  rollover_expires_at: RENEWS,
  updated_at: '2026-11-13T21:40:00+01:00',
};

const TOPUPS: TopupJson[] = [
  { code: 'topup_200', credits: 200, price_kobo: 60000, play_product_id: null },
  { code: 'topup_500', credits: 500, price_kobo: 150000, play_product_id: null },
  { code: 'topup_1000', credits: 1000, price_kobo: 300000, play_product_id: null },
];

const chapter = (n: number, at: string): HistoryItem => ({
  id: n,
  at,
  delta: -9,
  chapter_uid: `ch${n}`,
  chapter: `Chapter ${n}`,
  reason: 'chapter',
});

const line = (kind: string, at: string, delta: number, extra: Partial<HistoryLine> = {}): HistoryLine => ({
  kind,
  key: `${kind}-${at}`,
  at,
  delta,
  title: null,
  detail: {},
  ...extra,
});

const HISTORY: HistoryLine[] = [
  line('book_chapters', '2026-11-13T21:40:00+01:00', -36, {
    title: 'Harmattan Letters',
    detail: {
      paid: 36,
      price: 125,
      items: [
        chapter(5, '2026-11-13T21:40:00+01:00'),
        chapter(4, '2026-11-12T22:05:00+01:00'),
        chapter(3, '2026-11-11T21:12:00+01:00'),
        chapter(2, '2026-11-10T20:30:00+01:00'),
      ],
    },
  }),
  line('message', '2026-11-12T09:14:00+01:00', -5, { detail: { counterparty: 'Ifeoma Nwachukwu' } }),
  line('plan_grant', '2026-11-12T09:00:00+01:00', 800),
  line('rollover', '2026-11-12T08:59:00+01:00', 40),
  line('unlock_all', '2026-11-02T13:32:00+01:00', -110, { title: 'A House Called Grace' }),
  line('top_up', '2026-10-29T18:10:00+01:00', 200),
];

const SUB: SubscriptionJson = {
  id: 'sub1',
  plan: QUARTERLY,
  status: 'active',
  store: 'play',
  auto_renew: true,
  period_start: '2026-11-12T09:00:00+01:00',
  period_end: RENEWS,
  pause_until: null,
  pending_plan: null,
  price_kobo: 240000,
};

const noop = () => {};

/** The plan screens' footer link (`.link.t-sm.t-center`, 44 tall). */
function FootLink({ label }: { label: string }) {
  const { s } = useTheme();
  return (
    <View style={{ alignItems: 'center', minHeight: s(44), justifyContent: 'center' }}>
      <Link label={label} size={13.5} onPress={noop} />
    </View>
  );
}

export function Flow09({ page }: { page: Page09 }) {
  const { s } = useTheme();
  switch (page) {
    case 's-credits':
      return (
        <>
          <CreditsHero balance={BALANCE} plan={QUARTERLY} onBack={noop} onPlan={noop} />
          <TopUpSection
            mode="plan"
            packs={TOPUPS}
            selected="topup_500"
            onSelect={noop}
            plan={QUARTERLY}
            busy={false}
            offline={false}
            onBuy={noop}
            onPlans={noop}
          />
          <BuySection bookPrice={125} messageCost={5} tipFrom={20} />
          <HistorySection lines={HISTORY} hasMore={false} loadingMore={false} onMore={noop} />
        </>
      );
    case 's-plans':
      return (
        <>
          <PlanHero sub={SUB} loading={false} onBack={noop} />
          <OnbSheet>
            <SubPad>
              <PlanBody sub={SUB} plans={PLANS} selected="yearly" onSelect={noop} />
            </SubPad>
          </OnbSheet>
          <Foot>
            <Btn label="Switch to Yearly · ₦8,400" block />
            <FootLink label="Pause or cancel plan" />
          </Foot>
        </>
      );
    case 's-checkout':
      return (
        <>
          <CheckoutHero plan={QUARTERLY} onBack={noop} />
          <OnbSheet>
            <SubPad>
              <CheckoutBody
                plan={QUARTERLY}
                busy={false}
                restoring={false}
                offline={false}
                unavailable={false}
                error={null}
                onSubscribe={noop}
                onRestore={noop}
                onRetry={noop}
              />
            </SubPad>
          </OnbSheet>
        </>
      );
    case 's-plan-cancel':
      return (
        <>
          <CancelHero
            title="Take a break instead?"
            sub="Pause your plan and keep all 840 credits."
            onBack={noop}
          />
          <OnbSheet>
            <SubPad>
              <View style={{ gap: s(8) }}>
                <Text variant="label">Pause for</Text>
                <Segmented
                  options={[
                    { value: '1', label: '1 month' },
                    { value: '2', label: '2 months' },
                    { value: '3', label: '3 months' },
                  ]}
                  value="1"
                  onChange={noop}
                />
              </View>
              <Text size={13.5} color="ink2" style={{ lineHeight: s(13.5) * 1.45 }}>
                Billing stops and starts again on 12 March. Your credits, rollover and library stay exactly as
                they are.
              </Text>
              <CancelSummary plan={800} rollover={40} topup={0} until="12 Feb" />
            </SubPad>
          </OnbSheet>
          <Foot>
            <Btn label="Pause for 1 month" block />
            <FootLink label="Cancel in Google Play" />
          </Foot>
        </>
      );
  }
}
