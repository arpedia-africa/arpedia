import { View } from 'react-native';
import {
  Btn,
  Callout,
  Card,
  Cell,
  Count,
  Cover,
  EmptyState,
  Group,
  Hero,
  IconButton,
  KeyValue,
  Link,
  Meter,
  Pill,
  Section,
  Skeleton,
  Text,
  useTheme,
  type CoverTone,
  type KeyValueRow,
  type PillTone,
} from '@arpedia/ui';
import type { StudioBookStatus } from '@arpedia/core';
import { StSteps, SubHero } from './parts';

// s-studio, s-studio-books, s-studio-royalties. Pure views for the routes and tools/parity
// (`node tools/screen.mjs s-studio s-studio-books s-studio-royalties --css`).

// ─── s-studio ───────────────────────────────────────────────────────────────
export interface StudioHomeModel {
  name: string;
  stats: { books: string; minutes: string; followers: string; earned: string };
  /** Approval banner (rule 9). */
  banner: boolean;
  /** Suspended author rights: reason line; hides Submit (States: edge cases). */
  suspended: string | null;
  /** Non-authors opening the Studio from s-apply-sent see it with nothing in it yet. */
  preview?: boolean;
  books: { id: string; title: string; earned: string; credits: string; share: number }[];
  /** No books at all: "Submit your first book" with the 3-step summary. */
  noBooks: boolean;
  shortcuts: {
    messages: { sub: string; count: number };
    club: string;
    books: { sub: string; count: number };
    posts: string;
    earnings: { sub: string; trail: string | null };
    visibility: 'Public' | 'Private';
    payout: string;
    community: string;
  };
}

export type StudioGo =
  | 'reader'
  | 'submit'
  | 'post'
  | 'earnings'
  | 'inbox'
  | 'club'
  | 'books'
  | 'posts'
  | 'profile'
  | 'payout'
  | 'community';

/** `.hero-panel` inside `.st-grid`: white 88%, radius 14, padding 12 14, gap 2. */
function HeroPanel({ value, label }: { value: string; label: string }) {
  const { s } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        backgroundColor: 'rgba(255,255,255,0.88)',
        borderRadius: s(14),
        paddingVertical: s(12),
        paddingHorizontal: s(14),
        gap: s(2),
      }}
    >
      {/* .stat__value: display 800 20/1.1 tabular */}
      <Text family="display" size={20} weight={800} tabular oneLine style={{ lineHeight: s(20) * 1.1 }}>
        {value}
      </Text>
      <Text size={12} color="ink2" oneLine style={{ lineHeight: s(12) * 1.4 }}>
        {label}
      </Text>
    </View>
  );
}

function StGrid({ cells }: { cells: [string, string][] }) {
  const { s } = useTheme();
  const rows = [cells.slice(0, 2), cells.slice(2, 4)];
  return (
    <View style={{ gap: s(8) }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: s(8) }}>
          {row.map(([v, l]) => (
            <HeroPanel key={l} value={v} label={l} />
          ))}
        </View>
      ))}
    </View>
  );
}

function StudioHero({
  name,
  stats,
  onReader,
}: {
  name: string;
  stats: [string, string][] | null;
  onReader: () => void;
}) {
  const { s } = useTheme();
  return (
    <Hero
      bar={
        <>
          <View style={{ flex: 1, minWidth: 0, gap: s(4) }}>
            <Text size={12} weight={700} color="onOrg" oneLine style={{ lineHeight: s(12) * 1.4 }}>
              Author Studio
            </Text>
            <Text variant="h2" color="onOrg" ellipsis accessibilityRole="header">
              {`Hi, ${name}`}
            </Text>
          </View>
          <Btn label="Reader mode" variant="n" size="sm" onPress={onReader} />
        </>
      }
      sub="Your work this month."
    >
      {stats ? (
        <StGrid cells={stats} />
      ) : (
        <View style={{ gap: s(8) }} accessibilityLabel="Loading">
          {[0, 1].map((i) => (
            <View key={i} style={{ flexDirection: 'row', gap: s(8) }}>
              <Skeleton height={s(62)} radius={s(14)} style={{ flex: 1 }} />
              <Skeleton height={s(62)} radius={s(14)} style={{ flex: 1 }} />
            </View>
          ))}
        </View>
      )}
    </Hero>
  );
}

/** `.st-approved`: night card, bold line + 13px 80% white, dismiss button. */
function ApprovedBanner({ onDismiss }: { onDismiss: () => void }) {
  const { c, s } = useTheme();
  return (
    <View style={{ paddingTop: s(16), paddingHorizontal: s(16) }}>
      <View
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: s(12),
          backgroundColor: c.night,
          borderRadius: s(14),
          padding: s(14),
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text size={14.5} weight={700} color="#FFFFFF" style={{ lineHeight: s(14.5) * 1.45 }}>
            You’re approved as an Arpedia author
          </Text>
          <Text size={13} color="rgba(255,255,255,0.8)" style={{ lineHeight: s(13) * 1.45 }}>
            Create your public profile, upload books and manage your reader community.
          </Text>
        </View>
        <IconButton icon="x" label="Dismiss" onPress={onDismiss} color="#FFFFFF" />
      </View>
    </View>
  );
}

export function StudioHomeView({
  m,
  go,
  onDismissBanner,
}: {
  m: StudioHomeModel;
  go: (to: StudioGo) => void;
  onDismissBanner: () => void;
}) {
  const { s } = useTheme();
  const sc = m.shortcuts;
  const locked = !!m.preview || !!m.suspended;
  return (
    <>
      <StudioHero
        name={m.name}
        onReader={() => go('reader')}
        stats={[
          [m.stats.books, 'Published books'],
          [m.stats.minutes, 'Minutes read'],
          [m.stats.followers, 'Followers'],
          [m.stats.earned, 'Earned this month'],
        ]}
      />
      {m.preview ? (
        <View style={{ paddingTop: s(16), paddingHorizontal: s(16) }}>
          <Callout tone="info">
            This is a preview. Your Studio opens the day your application is approved.
          </Callout>
        </View>
      ) : m.suspended ? (
        <View style={{ paddingTop: s(16), paddingHorizontal: s(16) }}>
          <Callout tone="warn">
            {`Your author rights are paused: ${m.suspended} Your live books stay readable. Questions? Write to authors@arpedia.africa.`}
          </Callout>
        </View>
      ) : m.banner ? (
        <ApprovedBanner onDismiss={onDismissBanner} />
      ) : null}

      <Section title="Quick actions">
        <View style={{ paddingHorizontal: s(16), gap: s(8) }}>
          <Btn
            label="Submit a book for review"
            icon="upload"
            block
            disabled={locked}
            onPress={() => go('submit')}
          />
          <Btn
            label="New post"
            icon="pen"
            variant="s"
            block
            disabled={!!m.preview}
            onPress={() => go('post')}
          />
        </View>
      </Section>

      {m.noBooks ? (
        <Section title="Submit your first book">
          <View style={{ paddingHorizontal: s(16) }}>
            <StSteps
              items={[
                {
                  title: 'Upload your manuscript',
                  sub: 'Word is best. We turn it into chapters on your phone.',
                },
                {
                  title: 'Confirm chapters and preview',
                  sub: 'See the price readers pay and what you earn.',
                },
                { title: 'Send it for review', sub: 'Most reviews take minutes, always within 3 days.' },
              ]}
            />
          </View>
        </Section>
      ) : (
        <Section title="Earnings by book" link="Details" onLink={() => go('earnings')}>
          <View style={{ paddingHorizontal: s(16), gap: s(8) }}>
            {m.books.length === 0 ? (
              <Text size={13.5} color="ink2" style={{ lineHeight: s(13.5) * 1.45 }}>
                You will see credits and naira here as readers unlock your books.
              </Text>
            ) : (
              m.books.map((b) => (
                <View key={b.id} style={{ gap: s(4) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
                    <Text size={12} weight={700} ellipsis style={{ flex: 1, lineHeight: s(12) * 1.4 }}>
                      {b.title}
                    </Text>
                    <Text size={12} weight={700} tabular oneLine style={{ lineHeight: s(12) * 1.4 }}>
                      {b.earned}
                    </Text>
                  </View>
                  <Meter value={b.share} />
                  <Text size={12} color="ink3" tabular oneLine style={{ lineHeight: s(12) * 1.4 }}>
                    {`${b.credits} credits spent`}
                  </Text>
                </View>
              ))
            )}
          </View>
        </Section>
      )}

      <Section title="Shortcuts" style={{ paddingBottom: s(28) }}>
        <Group>
          <Cell
            title="Private messages"
            sub={sc.messages.sub}
            trail={sc.messages.count > 0 ? <Count value={sc.messages.count} /> : undefined}
            chevron
            onPress={() => go('inbox')}
          />
          <Cell title="My community chat" sub={sc.club} chevron onPress={() => go('club')} />
          <Cell
            title="My Books"
            sub={sc.books.sub}
            trail={
              <Text size={13} color="ink3" tabular oneLine>
                {String(sc.books.count)}
              </Text>
            }
            chevron
            onPress={() => go('books')}
          />
          <Cell title="Posts and comments" sub={sc.posts} chevron onPress={() => go('posts')} />
          <Cell
            title="Earnings"
            sub={sc.earnings.sub}
            trail={
              sc.earnings.trail ? (
                <Text size={13} weight={700} color="ink3" tabular oneLine>
                  {sc.earnings.trail}
                </Text>
              ) : undefined
            }
            chevron
            onPress={() => go('earnings')}
          />
          <Cell
            title="Author profile settings"
            trail={<Pill label={sc.visibility} tone={sc.visibility === 'Public' ? 'ok' : 'grey'} />}
            chevron
            onPress={() => go('profile')}
          />
          <Cell title="Payout account" sub={sc.payout} chevron onPress={() => go('payout')} />
          <Cell title="Club settings" sub={sc.community} chevron onPress={() => go('community')} />
        </Group>
      </Section>
    </>
  );
}

/** Loading, error and offline states of s-studio: the band with skeleton stats and rows. */
export function StudioHomeHold({
  name,
  error,
  onRetry,
  onReader,
}: {
  name: string;
  error: 'offline' | 'failed' | null;
  onRetry: () => void;
  onReader: () => void;
}) {
  const { s } = useTheme();
  return (
    <>
      <StudioHero name={name} stats={null} onReader={onReader} />
      {error ? (
        <EmptyState
          title={error === 'offline' ? 'You’re offline' : 'Couldn’t load your Studio'}
          body={
            error === 'offline'
              ? 'Connect to see your books and earnings.'
              : 'Something went wrong on our side. Try again.'
          }
          action={{ label: 'Try again', onPress: onRetry }}
        />
      ) : (
        <View style={{ paddingTop: s(24), paddingHorizontal: s(16), gap: s(12) }}>
          <Skeleton height={s(48)} radius={s(12)} />
          <Skeleton height={s(48)} radius={s(12)} />
          {[0, 1].map((i) => (
            <View key={i} style={{ gap: s(6), paddingTop: s(8) }}>
              <Skeleton width="60%" height={s(12)} />
              <Skeleton height={s(5)} />
              <Skeleton width="35%" height={s(12)} />
            </View>
          ))}
        </View>
      )}
    </>
  );
}

// ─── s-studio-books ─────────────────────────────────────────────────────────
export interface StudioBookModel {
  id: string;
  title: string;
  tone: CoverTone;
  status: StudioBookStatus;
  label: string;
  /** Soft line under the title (meta for live books, the next step for drafts, reasons). */
  line: string | null;
  /** Info pill: "Update v2 in review · readers still see v1". */
  update: string | null;
  /** Editor's issues for Changes requested (rule 24: same text as the pipeline flags). */
  issues: string[];
  action: string | null;
}

const PILL: Record<StudioBookStatus, PillTone> = {
  draft: 'grey',
  in_review: 'info',
  changes_requested: 'warn',
  live: 'ok',
  update_draft: 'ok',
  update_in_review: 'ok',
  scheduled: 'info',
  unpublished: 'grey',
  taken_down: 'err',
  rejected: 'err',
};

function BookCard({ b, onAction }: { b: StudioBookModel; onAction: (b: StudioBookModel) => void }) {
  const { s } = useTheme();
  const appeal = b.status === 'taken_down' || b.status === 'rejected';
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: s(12) }}>
        <Cover title={b.title} size={48} tone={b.tone} />
        <View style={{ flex: 1, minWidth: 0, gap: s(8) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
            <Text
              size={15}
              weight={600}
              numberOfLines={2}
              ellipsizeMode="tail"
              style={{ flex: 1, lineHeight: s(15) * 1.3 }}
            >
              {b.title}
            </Text>
            <Pill label={b.label} tone={PILL[b.status]} />
          </View>
          {b.line ? (
            <Text size={12} color="ink2" tabular style={{ lineHeight: s(12) * 1.4 }}>
              {b.line}
            </Text>
          ) : null}
          {b.update ? (
            <View style={{ flexDirection: 'row' }}>
              <Pill label={b.update} tone="info" />
            </View>
          ) : null}
          {b.issues.length ? <Callout tone="warn">{b.issues.join('\n')}</Callout> : null}
          {b.action && appeal ? (
            <Link label={b.action} onPress={() => onAction(b)} />
          ) : b.action ? (
            <View style={{ flexDirection: 'row' }}>
              <Btn label={b.action} variant="s" size="sm" onPress={() => onAction(b)} />
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

export function StudioBooksView({
  sub,
  books,
  state,
  onBack,
  onSubmit,
  onAction,
  onRetry,
  canSubmit = true,
}: {
  sub: string;
  books: StudioBookModel[] | null;
  state: 'ready' | 'loading' | 'offline' | 'failed';
  onBack: () => void;
  onSubmit: () => void;
  onAction: (b: StudioBookModel) => void;
  onRetry: () => void;
  canSubmit?: boolean;
}) {
  const { c, s } = useTheme();
  return (
    <>
      <SubHero
        title="My books"
        sub={sub}
        onBack={onBack}
        action={
          canSubmit ? (
            <IconButton icon="plus" label="Submit a book" onPress={onSubmit} color={c.onOrg} />
          ) : undefined
        }
      />
      {state === 'offline' || state === 'failed' ? (
        <EmptyState
          title={state === 'offline' ? 'You’re offline' : 'Couldn’t load your books'}
          body={
            state === 'offline'
              ? 'Connect to see your books and what to do next.'
              : 'Something went wrong on our side. Try again.'
          }
          action={{ label: 'Try again', onPress: onRetry }}
        />
      ) : state === 'loading' || !books ? (
        <View
          style={{ paddingTop: s(16), paddingHorizontal: s(16), gap: s(12) }}
          accessibilityLabel="Loading"
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={s(100)} radius={s(14)} />
          ))}
        </View>
      ) : books.length === 0 ? (
        <EmptyState
          title="Submit your first book"
          body="Upload your manuscript, confirm the chapters, then send it for review."
          action={canSubmit ? { label: 'Submit a book', onPress: onSubmit } : undefined}
        />
      ) : (
        <View style={{ paddingTop: s(16), paddingHorizontal: s(16), paddingBottom: s(28), gap: s(12) }}>
          {books.map((b) => (
            <BookCard key={b.id} b={b} onAction={onAction} />
          ))}
        </View>
      )}
    </>
  );
}

// ─── s-studio-royalties ─────────────────────────────────────────────────────
export interface PayoutRow {
  month: string;
  sub: string;
  amount: string;
  pill: { label: string; tone: PillTone };
}

export function StudioEarningsView({
  sub,
  total,
  rows,
  payouts,
  state,
  onBack,
  onRetry,
}: {
  sub: string;
  total: string;
  rows: KeyValueRow[];
  payouts: PayoutRow[];
  state: 'ready' | 'loading' | 'offline' | 'failed';
  onBack: () => void;
  onRetry: () => void;
}) {
  const { s } = useTheme();
  const ready = state === 'ready';
  return (
    <>
      <SubHero title="Earnings" sub={sub} onBack={onBack}>
        {ready ? (
          // .sub-balance: display 800 52/.95, -0.03em, tabular
          <Text
            family="display"
            size={52}
            weight={800}
            color="onOrg"
            tabular
            oneLine
            style={{ lineHeight: s(52) * 0.95, letterSpacing: s(52) * -0.03, paddingTop: s(4) }}
          >
            {total}
          </Text>
        ) : (
          <Skeleton width="60%" height={s(50)} radius={s(10)} />
        )}
      </SubHero>
      {state === 'offline' || state === 'failed' ? (
        <EmptyState
          title={state === 'offline' ? 'You’re offline' : 'Couldn’t load your earnings'}
          body={
            state === 'offline'
              ? 'Connect to see what you earned.'
              : 'Something went wrong on our side. Try again.'
          }
          action={{ label: 'Try again', onPress: onRetry }}
        />
      ) : !ready ? (
        <View
          style={{ paddingTop: s(16), paddingHorizontal: s(16), gap: s(12) }}
          accessibilityLabel="Loading"
        >
          <Skeleton height={s(130)} radius={s(14)} />
          <Skeleton height={s(120)} radius={s(14)} />
        </View>
      ) : (
        <>
          <View style={{ paddingTop: s(16), paddingHorizontal: s(16), gap: s(8) }}>
            <KeyValue rows={rows} />
            <Text size={12} color="ink3" style={{ lineHeight: s(12) * 1.4 }}>
              Readers who pay as they read pay chapter by chapter, so someone who stops halfway pays half.
              Readers who unlock all pay the whole price up front. Your own reading and refunds don’t count.
              Minimum payout ₦1,000.
            </Text>
          </View>
          <Section title="Payouts" style={{ paddingBottom: s(28) }}>
            {payouts.length === 0 ? (
              <Text size={13.5} color="ink2" style={{ paddingHorizontal: s(16), lineHeight: s(13.5) * 1.45 }}>
                You will see credits and naira here as readers unlock your books.
              </Text>
            ) : (
              <Group>
                {payouts.map((p) => (
                  <Cell
                    key={p.month}
                    title={p.month}
                    sub={p.sub}
                    trail={
                      <View style={{ gap: s(4) }}>
                        <Text size={15} weight={600} tabular oneLine style={{ lineHeight: s(15) * 1.3 }}>
                          {p.amount}
                        </Text>
                        <Pill label={p.pill.label} tone={p.pill.tone} />
                      </View>
                    }
                  />
                ))}
              </Group>
            )}
          </Section>
        </>
      )}
    </>
  );
}
