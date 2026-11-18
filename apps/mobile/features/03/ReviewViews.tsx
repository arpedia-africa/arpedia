import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { REVIEW_MAX } from '@arpedia/core';
import {
  Avatar,
  Btn,
  Chip,
  Field,
  Icon,
  IconButton,
  Meter,
  Press,
  Text,
  Toggle,
  useTheme,
  type AvatarTone,
} from '@arpedia/ui';

// s-reviews and s-write-review. Pure views for the routes and tools/parity
// (`node tools/screen.mjs s-reviews s-write-review --css`).

const n = (v: number) => v.toLocaleString('en-NG');

/** `.bk-rating`: big number, five stars, count, 5 → 1 bars. The same numbers as the book page. */
export function RatingSummary({
  rating,
  countLabel,
  bars,
}: {
  rating: string | null;
  countLabel: string;
  bars: number[];
}) {
  const { c, s } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(18), paddingHorizontal: s(16) }}>
      <View style={{ alignItems: 'center', gap: s(4) }}>
        <Text variant="display" size={48} weight={800} tabular style={{ lineHeight: s(48) * 0.9 }}>
          {rating ?? '–'}
        </Text>
        <View style={{ flexDirection: 'row', gap: s(1) }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Icon key={i} name="star" size="xs" color={c.star} filled />
          ))}
        </View>
        <Text size={12} color="ink3" oneLine>
          {countLabel}
        </Text>
      </View>
      <View style={{ flex: 1, gap: s(6) }}>
        {bars.map((v, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
            <Text size={12} tabular>
              {String(5 - i)}
            </Text>
            <Meter value={v} style={{ flex: 1 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** `.bk-starpill`: star and number in a star-coloured ring. */
export function StarPill({ stars }: { stars: number }) {
  const { c, s } = useTheme();
  return (
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
        {String(stars)}
      </Text>
    </View>
  );
}

export interface ReviewItem {
  id: string;
  userId: string;
  name: string;
  stars: number;
  body: string | null;
  spoiler: boolean;
  likes: number;
  liked: boolean;
  mine: boolean;
  /** "2 days ago" */
  age: string;
  tone?: AvatarTone;
}

/** `.bk-review`: head (avatar, name, stars, ⋯), text (spoilers hidden until tapped), likes and age. */
function Review({
  r,
  onMore,
  onLike,
}: {
  r: ReviewItem;
  onMore: (r: ReviewItem) => void;
  onLike: (r: ReviewItem) => void;
}) {
  const { c, s } = useTheme();
  const [shown, setShown] = useState(false);
  const hidden = r.spoiler && !shown && !r.mine;
  return (
    <View style={{ gap: s(8), padding: s(16), borderBottomWidth: 1, borderBottomColor: c.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
        <Avatar name={r.name} size="sm" tone={r.tone ?? 't'} />
        <Text size={15} weight={700} ellipsis numberOfLines={1} style={{ flex: 1 }}>
          {r.mine ? `${r.name} (you)` : r.name}
        </Text>
        <StarPill stars={r.stars} />
        <IconButton
          icon="more"
          label={r.mine ? 'More: edit or delete' : 'More: report or hide'}
          onPress={() => onMore(r)}
        />
      </View>
      {r.body ? (
        hidden ? (
          <Press onPress={() => setShown(true)} accessibilityRole="button" pressScale={0.99}>
            <Text size={14} color="ink2" italic style={{ lineHeight: s(14) * 1.5 }}>
              Contains spoilers. Tap to reveal
            </Text>
          </Press>
        ) : (
          <Text size={14} style={{ lineHeight: s(14) * 1.5 }}>
            {r.body}
          </Text>
        )
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(14) }}>
        <Press
          onPress={() => onLike(r)}
          disabled={r.mine}
          accessibilityRole="button"
          accessibilityLabel={`${r.liked ? 'Unlike' : 'Like'}, ${r.likes} likes`}
          accessibilityState={{ selected: r.liked }}
          hitSlop={12}
          style={{ flexDirection: 'row', alignItems: 'center', gap: s(5) }}
        >
          <Icon name="heart" size="xs" color={r.liked ? c.err : c.ink2} filled={r.liked} />
          <Text size={12.5} weight={600} color="ink2" tabular>
            {n(r.likes)}
          </Text>
        </Press>
        <Text size={12.5} color="ink3" oneLine>
          {r.age}
        </Text>
      </View>
    </View>
  );
}

/** s-reviews body below the hero: summary, Write a review, star filter, list. */
export function ReviewsView({
  rating,
  count,
  bars,
  filter,
  onFilter,
  reviews,
  onWrite,
  writeLabel,
  onMore,
  onLike,
  footer,
}: {
  rating: string | null;
  count: number;
  bars: number[];
  filter: number | null;
  onFilter: (stars: number | null) => void;
  reviews: ReviewItem[];
  onWrite: () => void;
  writeLabel: string;
  onMore: (r: ReviewItem) => void;
  onLike: (r: ReviewItem) => void;
  footer?: React.ReactNode;
}) {
  const { s } = useTheme();
  return (
    <View style={{ paddingBottom: s(28) }}>
      <View style={{ paddingTop: s(24) }}>
        <RatingSummary
          rating={rating}
          countLabel={`(${n(count)} ${count === 1 ? 'review' : 'reviews'})`}
          bars={bars}
        />
      </View>
      <View style={{ paddingHorizontal: s(16), paddingTop: s(16) }}>
        <Btn label={writeLabel} icon="pen" size="md" block onPress={onWrite} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: s(8), paddingHorizontal: s(16) }}
        style={{ paddingTop: s(16), flexGrow: 0 }}
      >
        <Chip label="All" icon="star" state={filter === null ? 'on' : 'off'} onPress={() => onFilter(null)} />
        {[5, 4, 3, 2, 1].map((st) => (
          <Chip
            key={st}
            label={String(st)}
            icon="star"
            state={filter === st ? 'on' : 'off'}
            // tapping the active chip clears it (rule 42)
            onPress={() => onFilter(filter === st ? null : st)}
          />
        ))}
      </ScrollView>
      <View style={{ paddingTop: s(8) }}>
        {reviews.length === 0 ? (
          <Text size={14} color="ink2" center style={{ padding: s(28) }}>
            {count === 0 ? 'Be the first to review this book.' : `No ${filter}-star reviews yet.`}
          </Text>
        ) : (
          reviews.map((r) => <Review key={r.id} r={r} onMore={onMore} onLike={onLike} />)
        )}
        {footer}
      </View>
    </View>
  );
}

/** `.star-input`: five 44px star buttons. */
function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row' }} accessibilityLabel={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((v) => (
        <IconButton
          key={v}
          icon="star"
          label={`${v} star${v === 1 ? '' : 's'}`}
          pressed={v <= value}
          color={v <= value ? c.star : c.control}
          onPress={() => onChange(v)}
        />
      ))}
    </View>
  );
}

/** s-write-review body: stars, text with counter, spoiler switch. */
export function WriteReviewView({
  stars,
  onStars,
  body,
  onBody,
  spoiler,
  onSpoiler,
}: {
  stars: number;
  onStars: (v: number) => void;
  body: string;
  onBody: (v: string) => void;
  spoiler: boolean;
  onSpoiler: (v: boolean) => void;
}) {
  const { s } = useTheme();
  return (
    <View style={{ paddingHorizontal: s(16), paddingTop: s(24), gap: s(16) }}>
      <StarInput value={stars} onChange={onStars} />
      <Field
        label="Write a review"
        placeholder="What stayed with you? (optional)"
        value={body}
        onChangeText={onBody}
        multiline
        numberOfLines={5}
        maxLength={REVIEW_MAX}
        textAlignVertical="top"
        hint={`${n(body.length)} / ${n(REVIEW_MAX)}`}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
        <View style={{ flex: 1, gap: s(4) }}>
          <Text size={15} weight={600} oneLine style={{ lineHeight: s(15) * 1.3 }}>
            Contains spoilers
          </Text>
          <Text size={12} color="ink3" oneLine style={{ lineHeight: s(12) * 1.4 }}>
            Others tap to reveal your review
          </Text>
        </View>
        <Toggle value={spoiler} onChange={onSpoiler} label="Contains spoilers" />
      </View>
    </View>
  );
}
