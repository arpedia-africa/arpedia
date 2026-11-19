// s-book-end, one to one with the prototype: low hero (Close, "Book n this year" pill, title, time
// read), Rate this ebook (.star-input), discussion and tip cells, Read next. Pure view.
import { View } from 'react-native';
import {
  Avatar,
  Cell,
  Cover,
  Group,
  Hero,
  Icon,
  IconButton,
  Pill,
  Press,
  Section,
  Text,
  motion,
  useTheme,
  type AvatarTone,
  type CoverTone,
} from '@arpedia/ui';

export interface BookEndModel {
  title: string;
  /** "4 h 26 min across 9 days." or null while loading. */
  timeLine: string | null;
  /** Books finished this calendar year, this one included. */
  yearCount: number | null;
  /** The reader's own rating, 0 when unrated. */
  stars: number;
  discussionSub: string;
  author: { name: string; tone: AvatarTone } | null;
  tipFrom: number;
  next: { id: string; title: string; author: string; tone: CoverTone } | null;
}

export function BookEndView({
  m,
  onClose,
  onRate,
  onDiscussion,
  onTip,
  onBook,
}: {
  m: BookEndModel;
  onClose: () => void;
  onRate: (stars: number) => void;
  onDiscussion: () => void;
  onTip: () => void;
  onBook: (id: string) => void;
}) {
  const { c, s } = useTheme();
  return (
    <>
      {/* .hero--low: the pill sits above the title, so the title and sub are drawn here, as Hero does */}
      <Hero low barBack bar={<IconButton icon="x" label="Close" onPress={onClose} />}>
        {m.yearCount ? (
          <View style={{ flexDirection: 'row' }}>
            <Pill tone="night" iconName="trophy" label={`Book ${m.yearCount} this year`} />
          </View>
        ) : null}
        <Text
          variant="display"
          size={36}
          color="onOrg"
          textBreakStrategy="balanced"
          style={{ lineHeight: s(36) * 1.02 }}
        >
          {`You finished ${m.title}.`}
        </Text>
        <Text
          size={14.5}
          color="onOrg"
          style={{ lineHeight: s(14.5) * 1.45, maxWidth: s(292.7), minHeight: s(21) }}
        >
          {m.timeLine ?? ''}
        </Text>
      </Hero>
      <View style={{ paddingHorizontal: s(16), paddingTop: s(16), gap: s(8) }}>
        <Text size={13} weight={600} oneLine>
          Rate this ebook
        </Text>
        {/* .star-input: .ib buttons with .ico.l.fill stars; .off for stars past the reader's rating */}
        <View style={{ flexDirection: 'row' }} accessibilityLabel="Rate 1 to 5 stars">
          {[1, 2, 3, 4, 5].map((i) => (
            <Press
              key={i}
              onPress={() => onRate(i)}
              pressScale={motion.press.icon}
              accessibilityRole="button"
              accessibilityLabel={i === 1 ? '1 star' : `${i} stars`}
              style={{
                width: s(44),
                height: s(44),
                borderRadius: s(12),
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="star" size="l" filled color={m.stars === 0 || i <= m.stars ? c.star : c.control} />
            </Press>
          ))}
        </View>
      </View>
      <Section>
        <Group>
          <Cell title="The discussion is open" sub={m.discussionSub} chevron onPress={onDiscussion} />
          {m.author ? (
            <Cell
              lead={<Avatar name={m.author.name} tone={m.author.tone} />}
              title={`Thank ${m.author.name.split(' ')[0]} with a tip`}
              sub={`From ${m.tipFrom} credits`}
              chevron
              ugc
              onPress={onTip}
            />
          ) : null}
        </Group>
      </Section>
      {m.next ? (
        <Section title="Read next" style={{ paddingBottom: s(28) }}>
          <Group>
            <Cell
              lead={<Cover title={m.next.title} size={48} tone={m.next.tone} />}
              title={m.next.title}
              sub={`${m.next.author} · readers of this book loved it`}
              chevron
              ugc
              onPress={() => onBook(m.next!.id)}
            />
          </Group>
        </Section>
      ) : (
        <View style={{ height: s(28) }} />
      )}
    </>
  );
}
