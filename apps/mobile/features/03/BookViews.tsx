import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  Avatar,
  Btn,
  Cover,
  Hero,
  Icon,
  IconButton,
  Meter,
  OnHero,
  Petals,
  Pill,
  Press,
  Skeleton,
  Text,
  rgba,
  useTheme,
  type AvatarTone,
  type CoverTone,
} from '@arpedia/ui';

// s-book. Pure views for app/book/[id].tsx and tools/parity
// (`node tools/screen.mjs s-book --css`).

const n = (v: number) => v.toLocaleString('en-NG');

/** Sample cover and avatar tones for books and people without an image, stable per id. */
const TONES: CoverTone[] = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];
const AV_TONES: AvatarTone[] = ['m', 'o', 'b', 't', 'r', 'k', 'g'];
const hash = (id: string) => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
export const coverTone = (id: string) => TONES[hash(id) % TONES.length]!;
export const avatarTone = (id: string) => AV_TONES[hash(id) % AV_TONES.length]!;

export interface BookCard {
  id: string;
  title: string;
  author: string;
  tone?: CoverTone;
}

export interface TopReview {
  id: string;
  name: string;
  stars: number;
  body: string;
  tone?: AvatarTone;
}

export interface BookPageModel {
  title: string;
  author: string;
  tone: CoverTone;
  following: boolean;
  /** "Christian & Faith · 250 pages · about 5 hr read" */
  meta: string;
  rating: string | null;
  reads: string;
  comments: string;
  mainLabel: string;
  /** Buy block; null when the reader owns the whole book or the book is coming soon. */
  buy:
    | { kind: 'options'; price: number; perChapter: number | null; balance: number }
    | { kind: 'rest'; paid: number; price: number; left: number; balance: number }
    | null;
  owned: boolean;
  description: string;
  tags: string[];
  reviewCount: number;
  bars: number[];
  topReview: TopReview | null;
  discussionOpen: boolean;
  related: BookCard[];
}

export interface BookPageActions {
  onBack: () => void;
  onSave?: () => void;
  onShare?: () => void;
  onMore: () => void;
  onAuthor?: () => void;
  onFollow?: () => void;
  onReviews: () => void;
  onDiscussion: () => void;
  onMain: () => void;
  onUnlockAll?: () => void;
  onPayGo?: () => void;
  onPayRest?: () => void;
  onTopUp?: () => void;
  onAbout: () => void;
  onWriteReview: () => void;
  onBook?: (id: string) => void;
  /** Spending disabled (offline, or price and balance still loading). */
  spendOff?: boolean;
  mainOff?: boolean;
}

/** `.bk-arrow`: 36×36 arrow link in a section head. */
function Arrow({ label, onPress }: { label: string; onPress: () => void }) {
  const { c, s } = useTheme();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      hitSlop={4}
      style={{
        width: s(36),
        height: s(36),
        borderRadius: s(10),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="arrow" size="s" color={c.orgInk} />
    </Press>
  );
}

/**
 * `.section__head` with a `.bk-arrow`: the arrow box has no baseline, so its bottom edge sits on the
 * title's baseline (align-items: baseline). Title 18px, line 26.1, baseline ≈ 19.6 from its top.
 */
function ArrowHead({ title, label, onPress }: { title: string; label: string; onPress: () => void }) {
  const { s } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: s(12),
        paddingHorizontal: s(16),
        paddingBottom: s(12),
      }}
    >
      <Text variant="h3" oneLine style={{ flex: 1, marginTop: s(36 - 19.6 - 8), lineHeight: s(18) * 1.45 }}>
        {title}
      </Text>
      <Arrow label={label} onPress={onPress} />
    </View>
  );
}

/** `.bk-seg`: 6px bar cut into 14 segments with 2px gaps; the first `on` segments in the main colour. */
function Seg({ on }: { on: number }) {
  const { c, s } = useTheme();
  return (
    <View style={{ flexDirection: 'row', height: s(6), marginTop: s(6), marginBottom: s(4), gap: s(2) }}>
      {Array.from({ length: 14 }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            borderTopLeftRadius: i === 0 ? s(3) : 0,
            borderBottomLeftRadius: i === 0 ? s(3) : 0,
            backgroundColor: i < on ? c.org : c.line,
          }}
        />
      ))}
    </View>
  );
}

/** `.bk-opt--all` sun: a petal ring (rgba(--sun-rgb,.4), inner edge at 24%) and a small disc. */
function Sun() {
  const { c, s } = useTheme();
  const size = s(92);
  const half = size / 2;
  const inner = Math.hypot(half, half) * 0.245;
  const pt = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(half + r * Math.sin(a)).toFixed(2)} ${(half - r * Math.cos(a)).toFixed(2)}`;
  };
  let d = '';
  for (let a = 0; a < 360; a += 30) {
    const b = a + 14;
    d += `M${pt(inner, a)}L${pt(half, a)}A${half} ${half} 0 0 1 ${pt(half, b)}L${pt(inner, b)}A${inner} ${inner} 0 0 0 ${pt(inner, a)}Z`;
  }
  return (
    <>
      <Svg
        pointerEvents="none"
        width={size}
        height={size}
        style={{ position: 'absolute', right: s(-30), top: s(-30) }}
      >
        <Path d={d} fill={rgba(c.sunRgb, 0.4)} />
      </Svg>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: s(1),
          top: s(1),
          width: s(30),
          height: s(30),
          borderRadius: 999,
          backgroundColor: rgba(c.sunRgb, 0.14),
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: s(5),
          top: s(5),
          width: s(22),
          height: s(22),
          borderRadius: 999,
          backgroundColor: rgba(c.sunRgb, 0.85),
        }}
      />
    </>
  );
}

/** `.bk-opt`: one of the two ways to pay. */
function Option({
  all,
  label,
  value,
  unit,
  note,
  onPress,
  disabled,
}: {
  all?: boolean;
  label: string;
  value: string;
  unit: string;
  note: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const { c, s, bw } = useTheme();
  // .bk-opt draws its ring as an inset shadow: the border sits inside the 14/14/12 padding.
  const ring = all ? bw(1.5) : bw(1);
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value} ${unit}. ${note}`}
      style={{
        flex: 1,
        gap: s(4),
        paddingTop: s(14) - ring,
        paddingHorizontal: s(14) - ring,
        paddingBottom: s(12) - ring,
        borderRadius: s(16),
        overflow: 'hidden',
        backgroundColor: all ? c.orgTint2 : c.white,
        borderWidth: ring,
        borderColor: all ? rgba(c.orgRgb, 0.55) : c.line,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {all ? <Sun /> : null}
      <Text size={12.5} weight={500} color="ink2" oneLine>
        {label}
      </Text>
      {/* `b` line box is 24 × 1.1; the display face's font padding would otherwise make it taller */}
      <View
        style={{ flexDirection: 'row', alignItems: 'baseline', height: s(24) * 1.1, overflow: 'visible' }}
      >
        <Text
          variant="display"
          size={24}
          weight={800}
          tabular
          oneLine
          style={{ lineHeight: s(24) * 1.1, letterSpacing: s(-0.24) }}
        >
          {value}
        </Text>
        <Text
          size={12.5}
          weight={600}
          color="ink2"
          oneLine
          style={{ marginLeft: s(4), lineHeight: s(24) * 1.1 }}
        >
          {unit}
        </Text>
      </View>
      <Seg on={all ? 14 : 3} />
      <Text size={11.5} color="ink3" oneLine style={{ lineHeight: s(11.5) * 1.3 }}>
        {note}
      </Text>
    </Press>
  );
}

/** `.bk-stat`: one column of the stats row. */
function Stat({
  value,
  label,
  star,
  onPress,
  first,
}: {
  value: string;
  label: string;
  star?: boolean;
  onPress?: () => void;
  first?: boolean;
}) {
  const { c, s } = useTheme();
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(3) }}>
        {star ? (
          <Text size={16} weight={800}>
            ★
          </Text>
        ) : null}
        <Text size={16} weight={800} tabular oneLine>
          {value}
        </Text>
      </View>
      <Text size={12} color="ink3" oneLine>
        {label}
      </Text>
    </>
  );
  const style = {
    flex: 1,
    alignItems: 'center' as const,
    gap: s(2),
    borderLeftWidth: first ? 0 : 1,
    borderLeftColor: c.line,
  };
  return onPress ? (
    <Press onPress={onPress} accessibilityRole="link" pressScale={1} style={style}>
      {body}
    </Press>
  ) : (
    <View style={style}>{body}</View>
  );
}

/** `.bk-hero` + `.bk-sheet` head: cover on the band, then title, author and Follow, meta. */
function BookHead({ m, a }: { m: BookPageModel; a: BookPageActions }) {
  const { c, s } = useTheme();
  return (
    <>
      <Hero
        barBack
        bar={
          <>
            <IconButton icon="back" label="Back" onPress={a.onBack} color={c.onOrg} />
            <View style={{ flex: 1 }} />
            <IconButton icon="bookmark" label="Save to library" onPress={a.onSave} color={c.onOrg} />
            <IconButton icon="share" label="Share" onPress={a.onShare} color={c.onOrg} />
            <IconButton icon="more" label="More options" onPress={a.onMore} color={c.onOrg} />
          </>
        }
        bodyStyle={{ alignItems: 'center', paddingTop: 0, paddingBottom: s(46) }}
      >
        <View style={{ transform: [{ rotate: '-2deg' }] }}>
          <Cover
            title={m.title}
            author={m.author}
            size={128}
            tone={m.tone}
            boxShadow={`0 ${s(14)}px ${s(30)}px rgba(26,17,0,0.32), inset ${s(3)}px 0 0 rgba(255,255,255,0.18)`}
          />
        </View>
      </Hero>
      <View
        style={{
          backgroundColor: c.white,
          borderTopLeftRadius: s(24),
          borderTopRightRadius: s(24),
          marginTop: s(-24),
          paddingTop: s(22),
        }}
      >
        <View style={{ alignItems: 'center', gap: s(6), paddingHorizontal: s(20) }}>
          <Text
            variant="display"
            size={27}
            weight={800}
            center
            accessibilityRole="header"
            textBreakStrategy="balanced"
            style={{ lineHeight: s(27) * 1.08, letterSpacing: s(-0.54) }}
          >
            {m.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10), maxWidth: '100%' }}>
            <Press onPress={a.onAuthor} accessibilityRole="link" pressScale={1} style={{ flexShrink: 1 }}>
              <Text size={15} weight={700} color="orgInk" ellipsis numberOfLines={1}>
                {m.author}
              </Text>
            </Press>
            {a.onFollow ? (
              <Press
                onPress={a.onFollow}
                accessibilityRole="button"
                accessibilityState={{ selected: m.following }}
                style={{
                  backgroundColor: m.following ? c.surface : c.night,
                  borderRadius: 999,
                  paddingVertical: s(5),
                  paddingHorizontal: s(12),
                }}
              >
                <Text size={12.5} weight={700} color={m.following ? c.ink2 : c.white} oneLine>
                  {m.following ? 'Following' : 'Follow'}
                </Text>
              </Press>
            ) : null}
          </View>
          <Text size={13} color="ink2" center oneLine>
            {m.meta}
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            marginTop: s(18),
            marginHorizontal: s(16),
            paddingVertical: s(12),
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: c.line,
          }}
        >
          <Stat first star value={m.rating ?? '–'} label="rating" onPress={a.onReviews} />
          <Stat value={m.reads} label="reads" />
          <Stat value={m.comments} label="comments" onPress={a.onDiscussion} />
        </View>
      </View>
    </>
  );
}

/** `.bk-actions`: the one main button and the buy block. */
function Actions({ m, a }: { m: BookPageModel; a: BookPageActions }) {
  const { s } = useTheme();
  const b = m.buy;
  return (
    <View style={{ gap: s(10), paddingTop: s(18), paddingHorizontal: s(16) }}>
      <Btn label={m.mainLabel} block onPress={a.onMain} disabled={a.mainOff} />
      {m.owned ? (
        <View style={{ alignItems: 'center' }}>
          <Pill label="Unlocked" tone="ok" />
        </View>
      ) : null}
      {b?.kind === 'options' ? (
        <View style={{ gap: s(8) }}>
          <View style={{ flexDirection: 'row', gap: s(8) }}>
            <Option
              all
              label="Unlock all"
              value={n(b.price)}
              unit="credits"
              note="Whole book, offline"
              onPress={a.onUnlockAll}
              disabled={a.spendOff}
            />
            {b.perChapter != null ? (
              <Option
                label="Pay as you read"
                value={`≈ ${n(b.perChapter)}`}
                unit="a chapter"
                note="Stop anytime"
                onPress={a.onPayGo}
                disabled={a.spendOff}
              />
            ) : null}
          </View>
          <Balance balance={b.balance} onTopUp={a.onTopUp} />
        </View>
      ) : b?.kind === 'rest' ? (
        <View style={{ gap: s(8) }}>
          <Text size={13} color="ink2" center oneLine>
            {`Paid ${n(b.paid)} of ${n(b.price)} · Pay the rest ${n(b.left)}`}
          </Text>
          <Btn
            label={`Pay the rest · ${n(b.left)} credits`}
            variant="s"
            block
            onPress={a.onPayRest}
            disabled={a.spendOff}
          />
          <Balance balance={b.balance} onTopUp={a.onTopUp} />
        </View>
      ) : null}
    </View>
  );
}

/** `.bk-balance`: "Your balance 840 credits" and Top up. */
function Balance({ balance, onTopUp }: { balance: number; onTopUp?: () => void }) {
  const { s } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: s(2),
        paddingHorizontal: s(4),
      }}
    >
      <Text size={12.5} color="ink3" oneLine>
        Your balance{' '}
        <Text size={12.5} weight={600}>
          {`${n(balance)} credits`}
        </Text>
      </Text>
      {onTopUp ? (
        <Press onPress={onTopUp} accessibilityRole="link" hitSlop={14} pressScale={1}>
          <Text size={12.5} weight={600} color="orgInk" oneLine>
            Top up
          </Text>
        </Press>
      ) : null}
    </View>
  );
}

function About({ m, a }: { m: BookPageModel; a: BookPageActions }) {
  const { s } = useTheme();
  return (
    <View style={{ paddingTop: s(24) }}>
      <ArrowHead title="About this book" label="More about this book" onPress={a.onAbout} />
      {/* Flow file rule 7: clamped to 4 lines (the prototype clamps 3). */}
      <Text size={15} numberOfLines={4} style={{ paddingHorizontal: s(16), lineHeight: s(15) * 1.5 }}>
        {m.description}
      </Text>
      {m.tags.length ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: s(6),
            paddingTop: s(12),
            paddingHorizontal: s(16),
          }}
        >
          {m.tags.slice(0, 4).map((t) => (
            <Pill key={t} label={t} tone="grey" />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Stars({ size = 'xs' }: { size?: 'xs' | 's' }) {
  const { c, s } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: s(1) }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Icon key={i} name="star" size={size} color={c.star} filled />
      ))}
    </View>
  );
}

function Ratings({ m, a }: { m: BookPageModel; a: BookPageActions }) {
  const { c, s } = useTheme();
  const r = m.topReview;
  return (
    <View style={{ paddingTop: s(24) }}>
      <ArrowHead title="Ratings & reviews" label="All reviews" onPress={a.onReviews} />
      {m.reviewCount === 0 ? (
        <View style={{ paddingHorizontal: s(16), gap: s(12), alignItems: 'flex-start' }}>
          <Text size={15} color="ink2">
            Be the first to review this book.
          </Text>
          <Btn label="Write a review" variant="s" size="sm" icon="pen" onPress={a.onWriteReview} />
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(18), paddingHorizontal: s(16) }}>
            <View style={{ alignItems: 'center', gap: s(4) }}>
              <Text variant="display" size={48} weight={800} tabular style={{ lineHeight: s(48) * 0.9 }}>
                {m.rating ?? '–'}
              </Text>
              <Stars />
              <Text size={12} color="ink3" oneLine>
                {`${n(m.reviewCount)} ${m.reviewCount === 1 ? 'review' : 'reviews'}`}
              </Text>
            </View>
            <View style={{ flex: 1, gap: s(6) }}>
              {m.bars.map((v, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
                  <Text size={12} tabular>
                    {String(5 - i)}
                  </Text>
                  <Meter value={v} style={{ flex: 1 }} />
                </View>
              ))}
            </View>
          </View>
          {r ? (
            <View
              style={{
                gap: s(8),
                marginTop: s(16),
                marginHorizontal: s(16),
                padding: s(14),
                borderRadius: s(14),
                backgroundColor: c.surface,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
                <Avatar name={r.name} size="sm" tone={r.tone ?? 't'} />
                <Text size={14.5} weight={700} ellipsis numberOfLines={1} style={{ flex: 1 }}>
                  {r.name}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: s(3),
                    paddingVertical: s(2),
                    paddingHorizontal: s(10),
                    borderRadius: 999,
                    borderWidth: s(1.5),
                    borderColor: c.star,
                  }}
                >
                  <Icon name="star" size="xs" color={c.orgInk} filled />
                  <Text size={12.5} weight={700} color="orgInk" tabular>
                    {String(r.stars)}
                  </Text>
                </View>
              </View>
              <Text size={14} style={{ lineHeight: s(14) * 1.5 }}>
                {r.body}
              </Text>
            </View>
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: s(12),
              paddingHorizontal: s(16),
            }}
          >
            <Btn label="Write a review" variant="s" size="sm" icon="pen" onPress={a.onWriteReview} />
            <Press onPress={a.onReviews} accessibilityRole="link" hitSlop={12} pressScale={1}>
              <Text size={14} weight={700} color="orgInk" oneLine>
                See all reviews
              </Text>
            </Press>
          </View>
        </>
      )}
    </View>
  );
}

/** `.bk-locked`: Discussion row, locked until 95% read. */
function Discussion({ m, a }: { m: BookPageModel; a: BookPageActions }) {
  const { c, s } = useTheme();
  return (
    <View style={{ paddingTop: s(24) }}>
      <Press
        onPress={a.onDiscussion}
        accessibilityRole="button"
        pressScale={0.99}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: s(12),
          marginHorizontal: s(16),
          padding: s(14),
          borderRadius: s(14),
          backgroundColor: c.surface,
        }}
      >
        <View style={{ flex: 1, gap: s(2) }}>
          <Text size={15} weight={700}>
            Discussion
          </Text>
          <Text size={13} color="ink2">
            {m.discussionOpen
              ? 'You finished it. Join the readers talking about this book'
              : 'Unlocks when you finish the book, so nothing spoils the story'}
          </Text>
        </View>
        <Icon name="chev" size="s" color={c.ink3} />
      </Press>
    </View>
  );
}

/** `.band`: Readers also loved, a rail of covers on the main colour. */
function Related({ m, a }: { m: BookPageModel; a: BookPageActions }) {
  const { c, s } = useTheme();
  if (m.related.length === 0) return <View style={{ height: s(28) }} />;
  return (
    <OnHero.Provider value>
      <View
        style={{
          backgroundColor: c.org,
          overflow: 'hidden',
          marginTop: s(24),
          paddingTop: s(18),
          paddingBottom: s(22),
        }}
      >
        <Petals size={s(280)} style={{ left: s(-120), bottom: s(-140) }} />
        <View style={{ paddingHorizontal: s(16), paddingBottom: s(12), marginBottom: s(12), gap: s(2) }}>
          <Text variant="h3" color="onOrg" oneLine style={{ lineHeight: s(18) * 1.45 }}>
            Readers also loved
          </Text>
          <Text size={12.5} color={rgba(c.onOrgRgb, 0.72)} ellipsis numberOfLines={1}>
            {`From readers who finished ${m.title}`}
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: s(12), paddingHorizontal: s(16), paddingBottom: s(6) }}
        >
          {m.related.map((b) => (
            <Press
              key={b.id}
              onPress={a.onBook ? () => a.onBook!(b.id) : undefined}
              pressScale={0.96}
              accessibilityRole="link"
              accessibilityLabel={`${b.title} by ${b.author}`}
              style={{ width: s(104), gap: s(6) }}
            >
              <Cover title={b.title} author={b.author} size={104} tone={b.tone ?? coverTone(b.id)} />
              <Text
                size={13}
                weight={600}
                color="onOrg"
                numberOfLines={2}
                ellipsis
                style={{ lineHeight: s(13) * 1.25 }}
              >
                {b.title}
              </Text>
              <Text size={12} weight={600} color={rgba(c.onOrgRgb, 0.78)} ellipsis numberOfLines={1}>
                {b.author}
              </Text>
            </Press>
          ))}
        </ScrollView>
      </View>
    </OnHero.Provider>
  );
}

/** The whole s-book body (inside a scroll view). */
export function BookPageView({ m, a, notice }: { m: BookPageModel; a: BookPageActions; notice?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ backgroundColor: c.white }}>
      <BookHead m={m} a={a} />
      {notice}
      <Actions m={m} a={a} />
      <About m={m} a={a} />
      <Ratings m={m} a={a} />
      <Discussion m={m} a={a} />
      <Related m={m} a={a} />
    </View>
  );
}

/** Loading: skeleton cover band, title lines, two button skeletons, price and balance chips. */
export function BookPageSkeleton({ onBack }: { onBack: () => void }) {
  const { c, s } = useTheme();
  return (
    <View style={{ backgroundColor: c.white }}>
      <Hero
        barBack
        bar={<IconButton icon="back" label="Back" onPress={onBack} color={c.onOrg} />}
        bodyStyle={{ alignItems: 'center', paddingTop: 0, paddingBottom: s(46) }}
      >
        <Skeleton width={s(128)} height={s(190)} radius={s(6)} />
      </Hero>
      <View
        style={{
          backgroundColor: c.white,
          borderTopLeftRadius: s(24),
          borderTopRightRadius: s(24),
          marginTop: s(-24),
          paddingTop: s(22),
          paddingHorizontal: s(16),
          alignItems: 'center',
          gap: s(10),
        }}
      >
        <Skeleton width="70%" height={s(28)} />
        <Skeleton width="45%" height={s(16)} />
        <Skeleton width="60%" height={s(14)} />
        <Skeleton height={s(48)} radius={s(12)} style={{ marginTop: s(18) }} />
        <View style={{ flexDirection: 'row', gap: s(8), alignSelf: 'stretch' }}>
          <Skeleton height={s(104)} radius={s(16)} style={{ flex: 1 }} />
          <Skeleton height={s(104)} radius={s(16)} style={{ flex: 1 }} />
        </View>
        <Skeleton width="50%" height={s(14)} style={{ alignSelf: 'flex-start' }} />
      </View>
    </View>
  );
}
