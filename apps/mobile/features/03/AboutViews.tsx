import { View } from 'react-native';
import {
  Avatar,
  Btn,
  Cell,
  Group,
  Hero,
  IconButton,
  Meter,
  Pill,
  Press,
  Skeleton,
  Text,
  useTheme,
} from '@arpedia/ui';

// s-book-about and s-book-discussion. Pure views for the routes and tools/parity
// (`node tools/screen.mjs s-book-about s-book-discussion --css`).

/** `.hero` with a back bar, title and sub (the plain sub-page band). */
export function BackHero({ title, sub, onBack }: { title: string; sub?: string; onBack: () => void }) {
  const { c } = useTheme();
  return (
    <Hero
      barBack
      bar={<IconButton icon="back" label="Back" onPress={onBack} color={c.onOrg} />}
      title={title}
      sub={sub}
    />
  );
}

export interface Fact {
  k: string;
  v: string;
  onPress?: () => void;
  num?: boolean;
}

/** `.bk-facts`: two columns, 18px rows, 16px columns. */
function Facts({ facts }: { facts: Fact[] }) {
  const { s } = useTheme();
  const rows: Fact[][] = [];
  for (let i = 0; i < facts.length; i += 2) rows.push(facts.slice(i, i + 2));
  return (
    <View style={{ gap: s(18) }}>
      {rows.map((row) => (
        <View key={row[0]!.k} style={{ flexDirection: 'row', gap: s(16) }}>
          {[0, 1].map((j) => {
            const f = row[j];
            return (
              <View key={j} style={{ flex: 1, minWidth: 0, gap: s(3) }}>
                {f ? (
                  <>
                    <Text size={13} weight={700} oneLine>
                      {f.k}
                    </Text>
                    {f.onPress ? (
                      <Press onPress={f.onPress} accessibilityRole="link" pressScale={1} hitSlop={8}>
                        <Text size={14} weight={600} color="orgInk">
                          {f.v}
                        </Text>
                      </Press>
                    ) : (
                      <Text size={14} color="ink2" tabular={f.num}>
                        {f.v}
                      </Text>
                    )}
                  </>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function AboutView({
  description,
  facts,
  notes,
  clean,
}: {
  description: string;
  facts: Fact[];
  notes: string[];
  clean: boolean;
}) {
  const { s } = useTheme();
  return (
    <View style={{ paddingHorizontal: s(16), paddingTop: s(24), paddingBottom: s(28), gap: s(24) }}>
      {description ? (
        // .t-reading's #2a2622 is a light-theme ink; the theme's ink keeps night readable
        <Text family="reading" size={15.5} color="ink" style={{ lineHeight: s(15.5) * 1.65 }}>
          {description}
        </Text>
      ) : null}
      <Facts facts={facts} />
      {notes.length || clean ? (
        <View style={{ gap: s(8) }}>
          <Text variant="h3" style={{ lineHeight: s(18) * 1.2 }}>
            Content notes
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(6) }}>
            {notes.map((t) => (
              <Pill key={t} label={t} tone="grey" />
            ))}
            {clean ? <Pill label="No explicit content" tone="ok" /> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function AboutSkeleton() {
  const { s } = useTheme();
  return (
    <View style={{ padding: s(16), gap: s(12) }}>
      <Skeleton height={s(16)} />
      <Skeleton height={s(16)} />
      <Skeleton height={s(16)} width="70%" />
      <View style={{ flexDirection: 'row', gap: s(16), marginTop: s(12) }}>
        <Skeleton height={s(40)} style={{ flex: 1 }} />
        <Skeleton height={s(40)} style={{ flex: 1 }} />
      </View>
      <View style={{ flexDirection: 'row', gap: s(16) }}>
        <Skeleton height={s(40)} style={{ flex: 1 }} />
        <Skeleton height={s(40)} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/** s-book-discussion before 95%: `.empty` with progress, Keep reading, then the open rows. */
export function DiscussionLockedView({
  percent,
  chapter,
  chapters,
  onRead,
  passage,
  club,
}: {
  percent: number;
  chapter: number;
  chapters: number;
  onRead: () => void;
  /** "Passage talk is open" row (flow 06); hidden until there is one. */
  passage?: { sub: string; onPress: () => void } | null;
  /** The club reading this book (flow 06), when there is one. */
  club?: { name: string; title: string; sub: string; onPress: () => void } | null;
}) {
  const { s } = useTheme();
  return (
    <View style={{ paddingBottom: s(28) }}>
      <View style={{ alignItems: 'center', gap: s(10), paddingVertical: s(36), paddingHorizontal: s(28) }}>
        <Text variant="display" size={19} weight={800} center>
          Finish the book to join in
        </Text>
        <Text size={13.5} color="ink2" center style={{ maxWidth: s(250) }}>
          The discussion opens once you reach the end, so nothing here spoils the story.
        </Text>
        <View style={{ gap: s(6), width: '100%', maxWidth: s(260) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: s(10) }}>
            <Text size={12.5} color="ink2" oneLine>
              {`You’re ${Math.floor(percent)}% through`}
            </Text>
            {chapters > 0 ? (
              <Text size={12.5} color="ink2" tabular oneLine>
                {`Chapter ${Math.max(1, chapter)} of ${chapters}`}
              </Text>
            ) : null}
          </View>
          <Meter value={percent / 100} />
        </View>
        <Btn label="Keep reading" icon="book" onPress={onRead} />
      </View>
      {passage || club ? (
        <View style={{ paddingTop: s(24) }}>
          <Group>
            {passage ? (
              <Cell title="Passage talk is open" sub={passage.sub} chevron onPress={passage.onPress} />
            ) : null}
            {club ? (
              <Cell
                title={club.title}
                sub={club.sub}
                lead={<Avatar name={club.name} size="md" tone="n" square />}
                chevron
                onPress={club.onPress}
              />
            ) : null}
          </Group>
        </View>
      ) : null}
    </View>
  );
}
