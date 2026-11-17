import { useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Arrive,
  Avatar,
  AvatarStack,
  base,
  Btn,
  Callout,
  Card,
  Cell,
  Chip,
  Count,
  Cover,
  Divider,
  EmptyState,
  Field,
  Group,
  GroupLabel,
  Header,
  Hero,
  IconButton,
  KeyValue,
  Meter,
  Pill,
  Ring,
  Section,
  Segmented,
  Sheet,
  Skeleton,
  TabBar,
  Tabs,
  Text,
  ThemeProvider,
  Toggle,
  Unread,
  THEMES,
  themeMeta,
  useTheme,
  useToast,
  type ThemeName,
} from '@arpedia/ui';
import { kitEnabled } from '@/lib/kit';
import { useUi } from '@/lib/ui-store';

const WIDTHS = [320, 360, 375] as const;

function Row({
  children,
  wrap = true,
  inset = true,
}: {
  children: React.ReactNode;
  wrap?: boolean;
  /** false when the parent already pads the sides */
  inset?: boolean;
}) {
  const { s } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: wrap ? 'wrap' : 'nowrap',
        gap: s(8),
        paddingHorizontal: inset ? s(16) : 0,
        alignItems: 'center',
      }}
    >
      {children}
    </View>
  );
}

function Gallery() {
  const { s, c } = useTheme();
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const [on, setOn] = useState(true);
  const [seg, setSeg] = useState<'grid' | 'list'>('grid');
  const [tab, setTab] = useState('reading');
  const [heroTab, setHeroTab] = useState('for-you');
  const [main, setMain] = useState('home');
  const [chip, setChip] = useState('all');

  return (
    <View style={{ flex: 1, backgroundColor: c.white }}>
      <ScrollView testID="kit-scroll" contentContainerStyle={{ paddingBottom: s(24) }}>
        <Hero
          bar={
            <>
              <Text variant="h2" color="onOrg" oneLine style={{ flex: 1 }}>
                arpedia
              </Text>
              <IconButton icon="search" label="Search" color={c.onOrg} />
              <IconButton icon="bell" label="Notifications" color={c.onOrg} dot />
            </>
          }
          title="Good evening, Ngozi"
          sub="Pick up Harmattan Letters where you stopped, chapter 7 of 14."
        >
          <Tabs
            onBand
            tabs={[
              { key: 'for-you', label: 'For you' },
              { key: 'new', label: 'New' },
              { key: 'top', label: 'Top 10' },
            ]}
            active={heroTab}
            onChange={setHeroTab}
          />
        </Hero>

        <Arrive index={1}>
          <Section title="Buttons" sub="Primary, secondary, ghost, night">
            <View style={{ gap: s(8), paddingHorizontal: s(16) }}>
              <Btn
                label="Start reading · first 10% free"
                block
                onPress={() => toast({ message: 'Opening the reader' })}
              />
              <Btn label="Unlock all · 125 credits" variant="s" block />
              <Btn label="Write a review" variant="g" icon="pen" size="sm" style={{ alignSelf: 'flex-start' }} />
              <Btn label="Pay the rest" variant="n" size="md" style={{ alignSelf: 'flex-start' }} />
              <Row inset={false}>
                <Btn label="Disabled" disabled size="md" />
                <Btn label="Saving" loading size="md" />
                <Btn label="Remove" variant="x" size="sm" />
              </Row>
            </View>
          </Section>
        </Arrive>

        <Arrive index={2}>
          <Section title="Icon buttons and chips">
            <Row>
              <IconButton icon="back" label="Back" />
              <IconButton icon="bookmark" label="Save" />
              <IconButton icon="share" label="Share" />
              <IconButton icon="more" label="More options" />
              <IconButton icon="bell" label="Notifications" dot />
            </Row>
            <View style={{ height: s(12) }} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: s(8), paddingHorizontal: s(16) }}
            >
              {['all', 'romance', 'faith', 'thriller', 'poetry'].map((k) => (
                <Chip
                  key={k}
                  label={k === 'all' ? 'All genres' : k[0]!.toUpperCase() + k.slice(1)}
                  state={chip === k ? 'on' : 'off'}
                  onPress={() => setChip(k)}
                />
              ))}
            </ScrollView>
            <View style={{ height: s(8) }} />
            <Row>
              <Chip label="Christian & Faith" state="sel" />
              <Chip label="Short stories" />
            </Row>
          </Section>
        </Arrive>

        <Arrive index={3}>
          <Section title="Forms">
            <View style={{ gap: s(16), paddingHorizontal: s(16) }}>
              <Field
                label="Email"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Field
                label="Password"
                placeholder="At least 8 characters"
                secureTextEntry
                hint="Use 8 or more letters and numbers."
              />
              <Field
                label="Phone"
                defaultValue="0803 000"
                error="Enter all 11 digits of your phone number."
              />
              <Field icon="search" placeholder="Books, authors, clubs" accessibilityLabel="Search" />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text variant="title">Auto-unlock next chapter</Text>
                <Toggle value={on} onChange={setOn} label="Auto-unlock next chapter" />
              </View>
              <Segmented
                options={[
                  { value: 'grid', label: 'Grid' },
                  { value: 'list', label: 'List' },
                ]}
                value={seg}
                onChange={setSeg}
              />
            </View>
          </Section>
        </Arrive>

        <Section title="Navigation">
          <Header title="Settings" onBack={() => {}} border />
          <Tabs
            tabs={[
              { key: 'reading', label: 'Reading' },
              { key: 'saved', label: 'Saved' },
              { key: 'finished', label: 'Finished' },
            ]}
            active={tab}
            onChange={setTab}
          />
          <View style={{ height: s(12) }} />
          <TabBar active={main} onChange={setMain} />
        </Section>

        <Section title="Lists" link="See all">
          <GroupLabel>RECENT</GroupLabel>
          <Group>
            <Cell
              title="Harmattan Letters"
              sub="Chapter 7 of 14 · 2 h 10 min left"
              lead={<Cover title="Harmattan Letters" size={40} tone="c1" />}
              chevron
              ugc
              onPress={() => {}}
            />
            <Cell title="Notifications" trail="On" chevron onPress={() => {}} />
            <Cell
              title="Ifeoma's Readers"
              sub="Public community · 860 members"
              lead={<Avatar name="Ifeoma Nwachukwu" tone="g" />}
              trail={<Count value={3} />}
            />
            <Cell title="Delete account" danger onPress={() => {}} />
          </Group>
        </Section>

        <Section title="Cards and numbers">
          <View style={{ gap: s(12), paddingHorizontal: s(16) }}>
            <Card soft>
              <Text variant="title">Quarterly · Most popular</Text>
              <Text variant="sm" color="ink2">
                800 credits ≈ 6 books · ₦800 a month
              </Text>
            </Card>
            <Card onPress={() => {}} accessibilityLabel="Open plan">
              <Text variant="title">Tap card</Text>
              <Text variant="sm" color="ink3">
                Sinks slightly when pressed
              </Text>
            </Card>
            <KeyValue
              rows={[
                { k: 'Your balance', v: '840 credits' },
                { k: 'Unlock all', v: '−125 credits' },
                { k: 'Left after', v: '715 credits', total: true },
              ]}
            />
            <Meter value={0.34} />
            <Row wrap={false}>
              <Ring value={0.62}>
                <Text size={11} weight={700} tabular>
                  62%
                </Text>
              </Ring>
              <Pill label="Live" tone="night" />
              <Pill label="Offline" tone="ok" />
              <Pill label="Late" tone="warn" />
              <Unread />
            </Row>
          </View>
        </Section>

        <Section title="Covers and people">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: s(12), paddingHorizontal: s(16), alignItems: 'flex-end' }}
          >
            <Cover title="Harmattan Letters" author="Ifeoma Nwachukwu" size={128} tone="c1" />
            <Cover title="Still Waters, Lagos" author="Chioma Okafor" size={88} tone="c2" />
            <Cover title="The Alignment" author="Adaeze Rosemary Possible" size={104} tone="c3" />
            <Cover title="Seven Bridges to Jos" author="Musa Danladi" size={64} tone="c4" />
            <Cover title="Ruth of Ibadan" author="Tolu Adebayo" size={104} tone="c5" />
            <Cover title="A House Called Grace" author="Kemi Ogunleye" size={88} tone="c6" />
            <Cover title="Psalms for the Danfo" author="Emeka Obi" size={64} tone="c7" />
            <Cover title="Bread on Water" author="Halima Bello" size={48} tone="c8" />
          </ScrollView>
          <View style={{ height: s(16) }} />
          <Row>
            <Avatar name="Ngozi Eze" size="xl" tone="m" />
            <Avatar name="Ifeoma Nwachukwu" size="lg" tone="g" />
            <Avatar name="Chiamaka Obi" tone="t" />
            <Avatar name="Tunde Bakare" size="sm" tone="b" />
            <Avatar name="Zainab Yusuf" size="xs" tone="k" />
            <AvatarStack
              people={[
                { name: 'Ngozi Eze', tone: 'm' },
                { name: 'Musa Danladi', tone: 'o' },
                { name: 'Halima Bello', tone: 'r' },
              ]}
            />
          </Row>
        </Section>

        <Section title="Feedback">
          <View style={{ gap: s(12), paddingHorizontal: s(16) }}>
            <Skeleton height={14} width="70%" />
            <Skeleton height={14} />
            <Skeleton height={96} radius={14} />
            <Callout tone="info">Your balance is shown before you spend.</Callout>
            <Callout tone="warn">You have 2 days left on your plan.</Callout>
            <Callout tone="brand">Pay as you read: about 9 credits a chapter, never more than 125.</Callout>
            <Callout tone="quiet">Re-reading is always free.</Callout>
            <Row>
              <Btn
                label="Show toast"
                size="sm"
                variant="s"
                onPress={() => toast({ message: 'Chapter 8 unlocked · 9 credits', onUndo: () => {} })}
              />
              <Btn label="Open sheet" size="sm" variant="g" onPress={() => setSheet(true)} />
            </Row>
          </View>
          <Divider inset />
          <EmptyState
            title="No highlights yet"
            body="Press and hold on a word to highlight it."
            action={{ label: 'Open a book', onPress: () => {} }}
          />
        </Section>
      </ScrollView>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Unlock all"
        footer={<Btn label="Unlock for 125 credits" block onPress={() => setSheet(false)} />}
      >
        <KeyValue
          rows={[
            { k: 'Harmattan Letters', v: '125 credits' },
            { k: 'Your balance', v: '840 credits' },
            { k: 'Left after', v: '715 credits', total: true },
          ]}
        />
        <Text variant="sm" color="ink2">
          The whole book downloads for offline reading, and you won't stop at chapter breaks again.
        </Text>
      </Sheet>
    </View>
  );
}

/** Dev-only gallery of every kit component, in every theme, at 320 / 360 / 375dp. */
export default function Kit() {
  const window = useWindowDimensions();
  const theme = useUi((st) => st.theme);
  const setTheme = useUi((st) => st.setTheme);
  const [width, setWidth] = useState<number>(Math.min(375, Math.round(window.width)));
  const [reduce, setReduce] = useState<boolean | undefined>(undefined);
  if (!kitEnabled) return <Redirect href="/home" />;

  return (
    <SafeAreaView
      testID="kit-gallery"
      style={{ flex: 1, backgroundColor: base.line }}
      edges={['top', 'bottom']}
    >
      <ThemeProvider theme={theme}>
        <View style={{ padding: 8, gap: 6, backgroundColor: base.ink }}>
          <Segmented<ThemeName>
            options={THEMES.map((t) => ({ value: t, label: themeMeta[t].label }))}
            value={theme}
            onChange={setTheme}
          />
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Segmented
                options={WIDTHS.map((w) => ({ value: String(w), label: `${w}dp` }))}
                value={String(width)}
                onChange={(v) => setWidth(Number(v))}
              />
            </View>
            <Chip
              label={reduce ? 'Motion off' : 'Motion on'}
              state={reduce ? 'on' : 'off'}
              onPress={() => setReduce((r) => !r)}
            />
          </View>
        </View>
      </ThemeProvider>
      <View style={{ flex: 1, width: Math.min(width, window.width), alignSelf: 'center' }}>
        <ThemeProvider key={`${theme}-${width}-${reduce}`} theme={theme} width={width} reduceMotion={reduce}>
          <Gallery />
        </ThemeProvider>
      </View>
    </SafeAreaView>
  );
}
