// Flow 10 · Profile tab (s-profile) and Reading goal sheet (s-goal). Views take data and callbacks
// only, so the parity page can draw them with the prototype's sample data.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import {
  Avatar,
  Btn,
  Cell,
  Field,
  Group,
  Hero,
  Icon,
  IconButton,
  Petals,
  Press,
  Section,
  Sheet,
  Skeleton,
  Text,
  motion,
  rgba,
  useFill,
  useTheme,
  type IconName,
} from '@arpedia/ui';
import { GOAL_OPTIONS, goalLine, goalProgress, goalStatus, paceHint, validGoal } from '@arpedia/core';
import type { ProfileSummary } from './data';

export interface ProfileViewProps {
  name: string;
  email: string;
  avatarUrl?: string | null;
  /** undefined while loading (skeletons, never zeros). */
  summary?: ProfileSummary;
  error?: boolean;
  onRetry?: () => void;
  onSettings: () => void;
  onGoal: () => void;
  onCollection: (tab: 'bookmark' | 'highlight' | 'note') => void;
  onAuthor: () => void;
}

/** `.av.xl.ring-night`: 4px main-colour then 2px night ring, drawn outside the avatar. */
function RingedAvatar({ name, uri }: { name: string; uri?: string | null }) {
  const { c, s } = useTheme();
  const r1 = s(4);
  const r2 = s(6);
  return (
    <View style={{ margin: -r2, padding: r2 - r1, borderRadius: 999, backgroundColor: c.night }}>
      <View style={{ padding: r1, borderRadius: 999, backgroundColor: c.org }}>
        <Avatar name={name || ' '} uri={uri ?? undefined} size="xl" tone="g" />
      </View>
    </View>
  );
}

/** `.stat`: grey tile with a big number. */
function Stat({ value, label, onPress }: { value?: number; label: string; onPress?: () => void }) {
  const { c, s } = useTheme();
  const body = (
    <>
      {value === undefined ? (
        <Skeleton width={s(36)} height={22} radius={6} />
      ) : (
        <Text variant="h3" size={20} tabular oneLine style={{ lineHeight: s(20) * 1.1 }}>
          {value.toLocaleString('en-NG')}
        </Text>
      )}
      <Text size={12} color="ink2" oneLine style={{ lineHeight: s(12) * 1.45 }}>
        {label}
      </Text>
    </>
  );
  const box = { flex: 1, backgroundColor: c.surface, borderRadius: s(14), padding: s(12) };
  if (!onPress) return <View style={box}>{body}</View>;
  return (
    <Press
      onPress={onPress}
      pressScale={motion.press.row}
      accessibilityLabel={`${value ?? ''} ${label}`}
      style={box}
    >
      {body}
    </Press>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** `.pro-goal .ring`: 64px, night fill on a 15% night track, accent disc (50px) in the middle. */
function GoalRing({ value, label }: { value: number; label: string }) {
  const { c, s } = useTheme();
  const f = useFill();
  const d = s(64);
  const disc = s(50);
  const stroke = (d - disc) / 2;
  const r = (d - stroke) / 2;
  const len = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  const props = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - pct * f.value) }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ width: d, height: d, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={d} height={d} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={d / 2} cy={d / 2} r={r} stroke={rgba('26,17,0', 0.15)} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={d / 2}
          cy={d / 2}
          r={r}
          stroke={c.night}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${len} ${len}`}
          animatedProps={props}
        />
      </Svg>
      <View
        style={{
          width: disc,
          height: disc,
          borderRadius: 999,
          backgroundColor: c.acc,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text size={12} weight={700} color={c.accOn} tabular oneLine>
          {label}
        </Text>
      </View>
    </View>
  );
}

/** `.band`: main-colour strip with petals at the bottom left. */
function Band({ children }: { children: React.ReactNode }) {
  const { c, s } = useTheme();
  return (
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
      {children}
    </View>
  );
}

/** `.ic-bub`: 36px tinted square with an icon (allowed on the Profile page only). */
function IconBubble({ icon, tone }: { icon: IconName; tone?: 'g' | 'b' | 'n' }) {
  const { c, s } = useTheme();
  const [bg, fg] =
    tone === 'g'
      ? [c.okT, c.ok]
      : tone === 'b'
        ? [c.infoT, c.info]
        : tone === 'n'
          ? [c.night, c.nightOn]
          : [c.orgTint, c.orgInk];
  return (
    <View
      style={{
        width: s(36),
        height: s(36),
        borderRadius: s(10),
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} color={fg} />
    </View>
  );
}

function CountTrail({ n }: { n?: number }) {
  const { s } = useTheme();
  return n === undefined ? (
    <Skeleton width={s(20)} height={13} radius={4} />
  ) : (
    <Text size={13} color="ink3" tabular oneLine>
      {n.toLocaleString('en-NG')}
    </Text>
  );
}

export function ProfileView({
  name,
  email,
  avatarUrl,
  summary,
  error,
  onRetry,
  onSettings,
  onGoal,
  onCollection,
  onAuthor,
}: ProfileViewProps) {
  const { c, s } = useTheme();
  const status = summary ? goalStatus(summary.read_this_year, summary.goal, summary.today) : undefined;
  const lastYearOnly = summary && !summary.goal && summary.last_year;
  return (
    <View>
      <Hero
        bar={
          <>
            <Text
              variant="display"
              size={30}
              color="onOrg"
              oneLine
              style={{ flex: 1, lineHeight: s(30) * 1.02 }}
            >
              Profile
            </Text>
            <IconButton icon="cog" label="Settings" onPress={onSettings} color={c.onOrg} />
          </>
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(14) }}>
          <RingedAvatar name={name} uri={avatarUrl} />
          <View style={{ flex: 1, minWidth: 0, gap: s(4) }}>
            <Text variant="h2" color="onOrg" ellipsis>
              {name}
            </Text>
            <Text variant="sm" color="onOrg" ellipsis>
              {email}
            </Text>
          </View>
        </View>
      </Hero>

      {error && !summary ? (
        <Section>
          <Press
            onPress={onRetry}
            accessibilityRole="button"
            style={{ paddingHorizontal: s(16), minHeight: s(44), justifyContent: 'center' }}
          >
            <Text variant="sm" color="ink2">
              Couldn't load your reading stats.{' '}
              <Text variant="sm" weight={600} color="orgInk">
                Try again
              </Text>
            </Text>
          </Press>
        </Section>
      ) : (
        <Section>
          <View style={{ flexDirection: 'row', gap: s(8), paddingHorizontal: s(16) }}>
            <Stat value={summary?.books_read} label="Books read" />
            <Stat value={summary?.following} label="Following" />
            <Stat value={summary?.highlights} label="Highlights" onPress={() => onCollection('highlight')} />
          </View>
        </Section>
      )}

      <Band>
        <Press
          onPress={onGoal}
          pressScale={motion.press.row}
          accessibilityRole="button"
          accessibilityLabel={status ? `Reading goal, ${goalLine(status)}` : 'Reading goal'}
          style={{ flexDirection: 'row', alignItems: 'center', gap: s(14), paddingHorizontal: s(16) }}
        >
          {!summary ? (
            <Skeleton width={s(64)} height={64} radius={32} />
          ) : (
            <GoalRing
              value={goalProgress(summary.read_this_year, summary.goal)}
              label={
                summary.goal ? `${summary.read_this_year}/${summary.goal}` : String(summary.read_this_year)
              }
            />
          )}
          <View style={{ flex: 1, minWidth: 0, gap: s(4) }}>
            <Text variant="label" color="onOrg" oneLine>
              Reading goal
            </Text>
            <Text variant="h3" color="onOrg" oneLine>
              {lastYearOnly ? `Set your goal for ${summary.year}` : 'Books this year'}
            </Text>
            {!summary ? (
              <Skeleton width="80%" height={13} radius={4} style={{ opacity: 0.5 }} />
            ) : (
              <Text variant="sm" color="onOrg" oneLine>
                {goalLine(status!)}
              </Text>
            )}
          </View>
          <Icon name="chev" color={c.onOrg} />
        </Press>
      </Band>

      <Section title="My collection">
        <Group>
          <Cell
            title="My bookmarks"
            lead={<IconBubble icon="bookmark" />}
            trail={<CountTrail n={summary?.bookmarks} />}
            chevron
            onPress={() => onCollection('bookmark')}
          />
          <Cell
            title="My highlights"
            lead={<IconBubble icon="pen" tone="b" />}
            trail={<CountTrail n={summary?.highlights} />}
            chevron
            onPress={() => onCollection('highlight')}
          />
          <Cell
            title="My notes"
            lead={<IconBubble icon="file" tone="g" />}
            trail={<CountTrail n={summary?.notes} />}
            chevron
            onPress={() => onCollection('note')}
          />
        </Group>
      </Section>

      <Section title="Author" style={{ paddingBottom: s(28) }}>
        <Group>
          {summary?.is_author ? (
            <Cell
              title="Author Studio"
              sub="Your books, readers and earnings"
              lead={<IconBubble icon="pen" tone="n" />}
              chevron
              onPress={onAuthor}
            />
          ) : (
            <Cell
              title="Become an Arpedia author"
              sub="Publish, meet readers, earn monthly"
              lead={<IconBubble icon="pen" tone="n" />}
              chevron
              onPress={onAuthor}
            />
          )}
        </Group>
      </Section>
    </View>
  );
}

/* ─── Reading goal sheet (s-goal) ────────────────────────────────────────── */
export interface GoalSheetProps {
  open: boolean;
  current: number | null;
  read: number;
  saving?: boolean;
  error?: string;
  onClose: () => void;
  onSave: (target: number) => void;
}

export function GoalSheet({ open, current, read, saving, error, onClose, onSave }: GoalSheetProps) {
  const { c, s, bw } = useTheme();
  const [pick, setPick] = useState<number | null>(current);
  const [own, setOwn] = useState(current && !GOAL_OPTIONS.includes(current as never) ? String(current) : '');
  useEffect(() => {
    if (open) {
      setPick(current);
      setOwn(current && !GOAL_OPTIONS.includes(current as never) ? String(current) : '');
    }
  }, [open, current]);
  const ownN = own ? Number(own) : null;
  const value = ownN ?? pick;
  const ok = value !== null && validGoal(value);
  return (
    <Sheet open={open} onClose={onClose} title="Books this year" locked={saving}>
      <Text variant="sm" color="ink2">
        Finishing a book counts towards your goal.
      </Text>
      <View style={{ flexDirection: 'row', gap: s(8) }}>
        {GOAL_OPTIONS.map((n) => {
          const on = !ownN && pick === n;
          return (
            <Press
              key={n}
              onPress={() => {
                setPick(n);
                setOwn('');
              }}
              pressScale={motion.press.button}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${n} books`}
              style={{
                flex: 1,
                minHeight: s(68),
                borderRadius: s(14),
                borderWidth: on ? s(2) : bw(1),
                borderColor: on ? c.org : c.line,
                backgroundColor: on ? c.orgTint2 : c.white,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="h2" size={22} tabular oneLine style={{ lineHeight: s(22) }}>
                {String(n)}
              </Text>
            </Press>
          );
        })}
      </View>
      <Field
        placeholder="Or enter your own number"
        accessibilityLabel="Your own number"
        keyboardType="number-pad"
        maxLength={3}
        value={own}
        onChangeText={(t) => setOwn(t.replace(/[^0-9]/g, ''))}
        error={ownN !== null && !validGoal(ownN) ? 'Pick a number from 1 to 365.' : undefined}
      />
      {ok ? (
        <Text variant="sm" color="ink2" style={{ textAlign: 'center' }}>
          {paceHint(value, read)}
        </Text>
      ) : null}
      {error ? (
        <Text variant="sm" color="err" style={{ textAlign: 'center' }}>
          {error}
        </Text>
      ) : null}
      <Btn
        label="Set goal"
        icon="trophy"
        block
        disabled={!ok}
        loading={saving}
        onPress={() => ok && onSave(value)}
      />
    </Sheet>
  );
}
