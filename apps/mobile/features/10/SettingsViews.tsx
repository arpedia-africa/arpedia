// Flow 10 · Settings (s-account), App colour (s-theme-settings), Notifications (s-notif-prefs),
// Security (s-security), About (s-about) and Delete account (s-delete-account). Pure views: the
// routes in app/(account) pass data and callbacks; tools/parity draws them with sample data.
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  Avatar,
  Btn,
  Callout,
  Cell,
  Field,
  Group,
  GroupLabel,
  Hero,
  IconButton,
  Pill,
  Press,
  Section,
  Sheet,
  Skeleton,
  Text,
  THEMES,
  Toggle,
  motion,
  themeMeta,
  themes,
  useBottomInset,
  useTheme,
  type ThemeName,
} from '@arpedia/ui';
import { DOWNLOAD_DEVICES, deleteConfirmed } from '@arpedia/core';

/* ─── Shared pieces ──────────────────────────────────────────────────────── */
/** `.hero.sub-hero` with a back button: title, sub, body padding-bottom 44. */
export function SubHero({
  title,
  sub,
  onBack,
  action,
}: {
  title: string;
  sub?: string;
  onBack: () => void;
  action?: ReactNode;
}) {
  const { c, s } = useTheme();
  return (
    <Hero
      barBack
      bar={
        <>
          <IconButton icon="back" label="Back" onPress={onBack} color={c.onOrg} />
          <View style={{ flex: 1 }} />
          {action}
        </>
      }
      title={title}
      sub={sub}
    >
      {/* sub-hero: 44 below instead of 20 (gap 12 + 12) */}
      <View style={{ height: s(12) }} />
    </Hero>
  );
}

/** `.hero__bar--back` with the title in the bar (`.hero__title.fill`). */
function BarTitle({ title, onBack }: { title: string; onBack: () => void }) {
  const { c, s } = useTheme();
  return (
    <>
      <IconButton icon="back" label="Back" onPress={onBack} color={c.onOrg} />
      <Text variant="display" size={30} color="onOrg" oneLine style={{ flex: 1, lineHeight: s(30) * 1.02 }}>
        {title}
      </Text>
    </>
  );
}

/** Trail text (`.t-sm.t-soft`). */
function Soft({ children }: { children: string }) {
  return (
    <Text variant="sm" color="ink2" tabular oneLine>
      {children}
    </Text>
  );
}

/* ─── s-account ──────────────────────────────────────────────────────────── */
export type ReaderTheme = 'light' | 'sepia' | 'dark';

/** Reader page colours (`.swatch--light|sepia|dark`): the book page, the same in every app colour. */
const SWATCHES: Record<ReaderTheme, { bg: string; fg: string; edge?: string; label: string }> = {
  light: { bg: '#FFFFFF', fg: '#1D1A16', label: 'Light' },
  sepia: { bg: '#F6EBD9', fg: '#3B2F22', edge: '#E6D6BC', label: 'Sepia' },
  dark: { bg: '#14110D', fg: '#E8E0D4', label: 'Dark' },
};

function Swatch({ t, on, onPress }: { t: ReaderTheme; on: boolean; onPress: () => void }) {
  const { c, s, bw } = useTheme();
  const sw = SWATCHES[t];
  return (
    <Press
      onPress={onPress}
      pressScale={motion.press.button}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${sw.label} reader theme`}
      style={{
        flex: 1,
        minHeight: s(56),
        borderRadius: s(12),
        backgroundColor: sw.bg,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: on
          ? `inset 0 0 0 ${s(2)}px ${c.org}, inset 0 0 0 ${s(4)}px #FFFFFF`
          : `inset 0 0 0 ${bw(1)}px ${sw.edge ?? c.line}`,
      }}
    >
      <Text family="reading" size={15} color={sw.fg} oneLine>
        {sw.label}
      </Text>
    </Press>
  );
}

export interface SettingsData {
  name: string;
  email: string;
  avatarUrl?: string | null;
  blocked?: number;
  interests?: number;
  navigation?: string;
  readerTheme: ReaderTheme;
  downloads?: string;
  credits?: number;
  subscription?: { label: string; tone: 'ok' | 'warn' | 'grey' } | null;
  appColour: ThemeName;
  version: string;
}

export interface SettingsActions {
  onBack: () => void;
  onEditProfile: () => void;
  onNotifications: () => void;
  onSecurity: () => void;
  onPrivacy: () => void;
  onExport?: () => void;
  onPreferences: () => void;
  onNavigation: () => void;
  onReaderTheme: (t: ReaderTheme) => void;
  onDownloads: () => void;
  onCredits: () => void;
  onSubscription: () => void;
  onAppColour: () => void;
  onInvite: () => void;
  onAbout: () => void;
  onLogOut: () => void;
  onDelete: () => void;
}

export function SettingsView({ d, a }: { d: SettingsData; a: SettingsActions }) {
  const { s } = useTheme();
  return (
    <View>
      <Hero barBack bar={<BarTitle title="Settings" onBack={a.onBack} />}>
        {/* .pro-card: white 90%, radius 14, padding 12 14, gap 12 */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(12),
            backgroundColor: 'rgba(255,255,255,0.9)',
            borderRadius: s(14),
            paddingVertical: s(12),
            paddingHorizontal: s(14),
          }}
        >
          <Avatar name={d.name || ' '} uri={d.avatarUrl ?? undefined} size="lg" tone="g" />
          <View style={{ flex: 1, minWidth: 0, gap: s(4) }}>
            <Text variant="title" ellipsis>
              {d.name}
            </Text>
            <Text variant="xs" color="ink2" ellipsis>
              {d.email}
            </Text>
          </View>
          <Btn label="Edit" variant="n" size="sm" onPress={a.onEditProfile} />
        </View>
      </Hero>

      <Section>
        <GroupLabel>Account</GroupLabel>
        <Group>
          <Cell title="Edit profile" chevron onPress={a.onEditProfile} />
          <Cell title="Notifications" sub="Replies, authors, reminders" chevron onPress={a.onNotifications} />
          <Cell title="Security" sub="Password, devices" chevron onPress={a.onSecurity} />
          <Cell
            title="Privacy"
            sub={d.blocked === undefined ? 'Blocked people' : `Blocked people · ${d.blocked}`}
            chevron
            onPress={a.onPrivacy}
          />
          {/* Reader self-export (flow 10 Server table, Q4 default: from Settings, emailed). Not in the
              prototype; the parity gallery leaves it out. */}
          {a.onExport ? (
            <Cell title="Export my data" sub="We email you a copy" chevron onPress={a.onExport} />
          ) : null}
        </Group>
      </Section>

      <Section>
        <GroupLabel>Reading</GroupLabel>
        <Group>
          <Cell
            title="Preferences"
            trail={d.interests === undefined ? undefined : <Soft>{`${d.interests} selected`}</Soft>}
            chevron
            onPress={a.onPreferences}
          />
          <Cell
            title="Navigation"
            trail={<Soft>{d.navigation ?? 'Swipe pages'}</Soft>}
            chevron
            onPress={a.onNavigation}
          />
        </Group>
      </Section>

      <Section>
        <GroupLabel>Default reader theme</GroupLabel>
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: 'row', gap: s(8), paddingHorizontal: s(16) }}
        >
          {(['light', 'sepia', 'dark'] as const).map((t) => (
            <Swatch key={t} t={t} on={d.readerTheme === t} onPress={() => a.onReaderTheme(t)} />
          ))}
        </View>
      </Section>

      <Section>
        <GroupLabel>Storage</GroupLabel>
        <Group>
          <Cell
            title="Downloads"
            sub={d.downloads ?? 'No books downloaded · Wi-Fi only'}
            chevron
            onPress={a.onDownloads}
          />
        </Group>
      </Section>

      <Section>
        <GroupLabel>Payments</GroupLabel>
        <Group>
          <Cell
            title="Credits"
            trail={
              d.credits === undefined ? undefined : <Soft>{`${d.credits.toLocaleString('en-NG')} cr`}</Soft>
            }
            chevron
            onPress={a.onCredits}
          />
          <Cell
            title="Subscription"
            trail={
              d.subscription ? (
                <Pill label={d.subscription.label} tone={d.subscription.tone} />
              ) : (
                <Soft>No plan</Soft>
              )
            }
            chevron
            onPress={a.onSubscription}
          />
        </Group>
      </Section>

      <Section>
        <GroupLabel>App</GroupLabel>
        <Group>
          <Cell
            title="App colour"
            sub="Sunflower, Palm, Plum or Night"
            trail={<Soft>{themeMeta[d.appColour].label}</Soft>}
            chevron
            onPress={a.onAppColour}
          />
          <Cell title="Invite friends" sub="Share your link with friends" onPress={a.onInvite} />
          <Cell title="About Arpedia" sub={`Version ${d.version}`} chevron onPress={a.onAbout} />
          <Cell title="Help and support" sub="support@arpedia.africa" chevron onPress={a.onAbout} />
        </Group>
      </Section>

      {/* .pro-session: gap 10, padding 8 16 0, body-end 28 */}
      <View style={{ gap: s(10), paddingTop: s(8), paddingHorizontal: s(16), paddingBottom: s(28) }}>
        <Btn label="Log out" icon="out" variant="g" block onPress={a.onLogOut} />
        <Press
          onPress={a.onDelete}
          accessibilityRole="button"
          style={{ padding: s(8), alignItems: 'center' }}
        >
          <Text size={14} weight={700} color="err" oneLine>
            Delete account
          </Text>
        </Press>
      </View>
    </View>
  );
}

/* ─── s-theme-settings ───────────────────────────────────────────────────── */
function tilePetals(size: number) {
  const c = size / 2;
  const inner = Math.hypot(c, c) * 0.225;
  const pt = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(c + r * Math.sin(a)).toFixed(2)} ${(c - r * Math.cos(a)).toFixed(2)}`;
  };
  let d = '';
  for (let a = 0; a < 360; a += 30) {
    const b = a + 14;
    d += `M${pt(inner, a)}L${pt(c, a)}A${c} ${c} 0 0 1 ${pt(c, b)}L${pt(inner, b)}A${inner} ${inner} 0 0 0 ${pt(inner, a)}Z`;
  }
  return d;
}

/** `.th-tile` (same element as onboarding's s-theme; flow 01 keeps its copy private). */
function ThemeTile({ name, selected, onPress }: { name: ThemeName; selected: boolean; onPress: () => void }) {
  const { c: cur, s, bw } = useTheme();
  const t = themes[name];
  const meta = themeMeta[name];
  const petal = s(110);
  return (
    <Press
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${meta.label}: ${meta.feel}`}
      style={{
        flex: 1,
        aspectRatio: 1,
        borderRadius: s(22),
        boxShadow: selected
          ? `0 0 0 ${s(3)}px ${cur.white}, 0 0 0 ${s(5.5)}px ${cur.ink}, 0 ${s(14)}px ${s(26)}px -${s(20)}px rgba(0,0,0,0.55)`
          : `0 ${s(14)}px ${s(26)}px -${s(20)}px rgba(0,0,0,0.55)`,
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: s(22),
          padding: s(16),
          backgroundColor: t.org,
          justifyContent: 'flex-end',
          gap: s(2),
          overflow: 'hidden',
        }}
      >
        <Svg width={petal} height={petal} style={{ position: 'absolute', right: s(-38), top: s(-38) }}>
          <Path
            d={tilePetals(petal)}
            fill={`rgba(${cur.petalRgb},${(name === 'sunflower' ? 0.8 : 0.45) * cur.petalK})`}
          />
        </Svg>
        {selected ? (
          <View
            style={{
              position: 'absolute',
              top: s(12),
              left: s(12),
              width: s(26),
              height: s(26),
              borderRadius: s(13),
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 ${s(2)}px ${s(6)}px rgba(0,0,0,0.25)`,
            }}
          >
            <View
              style={{
                width: s(10) + bw(2),
                height: s(5) + bw(2),
                borderLeftWidth: bw(2),
                borderBottomWidth: bw(2),
                borderColor: '#111827',
                transform: [{ rotate: '-45deg' }, { translateX: s(1) }, { translateY: s(-1) }],
              }}
            />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: s(5), marginBottom: s(8) }}>
          {[t.acc, '#E8A600'].map((dot, i) => (
            <View
              key={i}
              style={{
                width: s(14),
                height: s(14),
                borderRadius: s(7),
                backgroundColor: dot,
                boxShadow: `0 0 0 ${s(2)}px rgba(255,255,255,0.55)`,
              }}
            />
          ))}
        </View>
        <Text
          family="display"
          weight={800}
          size={19}
          color={t.onOrg}
          oneLine
          style={{ letterSpacing: s(19) * -0.01 }}
        >
          {meta.label}
        </Text>
        <Text size={12.5} color={t.onOrg} style={{ lineHeight: s(12.5) * 1.3, opacity: 0.88 }}>
          {meta.feel}
        </Text>
      </View>
    </Press>
  );
}

export function ThemeSheet({
  open,
  value,
  onPick,
  onClose,
}: {
  open: boolean;
  value: ThemeName;
  onPick: (t: ThemeName) => void;
  onClose: () => void;
}) {
  const { s } = useTheme();
  return (
    <Sheet open={open} onClose={onClose} title="App colour" bold>
      {/* the prototype's sheet body is `.body` (padding 16 0 22), not `.pb` (16 18 28): undo the difference */}
      <View style={{ marginHorizontal: s(-18), marginBottom: s(-6) }}>
        <ThemeBody value={value} onPick={onPick} onDone={onClose} />
      </View>
    </Sheet>
  );
}

/** Theme tiles and Done (`.th-grid` padding 0 16, gap 14). */
export function ThemeBody({
  value,
  onPick,
  onDone,
}: {
  value: ThemeName;
  onPick: (t: ThemeName) => void;
  onDone: () => void;
}) {
  const { s } = useTheme();
  const rows = [THEMES.slice(0, 2), THEMES.slice(2, 4)];
  return (
    <View style={{ gap: s(14) }}>
      <View accessibilityRole="radiogroup" style={{ gap: s(12), paddingHorizontal: s(16) }}>
        {rows.map((row, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: s(12) }}>
            {row.map((t) => (
              <ThemeTile key={t} name={t} selected={t === value} onPress={() => onPick(t)} />
            ))}
          </View>
        ))}
      </View>
      <View style={{ paddingHorizontal: s(16) }}>
        <Btn label="Done" block onPress={onDone} />
      </View>
    </View>
  );
}

/* ─── s-notif-prefs ──────────────────────────────────────────────────────── */
export interface NotifPrefs {
  clubs: boolean;
  authors: boolean;
  note_replies: boolean;
  reminders: boolean;
  offers: boolean;
  quiet_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
}
export type NotifKey = keyof Omit<NotifPrefs, 'quiet_start' | 'quiet_end'>;

function ToggleCell({
  title,
  sub,
  value,
  onChange,
  disabled,
}: {
  title: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Cell
      title={title}
      sub={sub}
      trail={<Toggle value={value} onChange={onChange} label={title} disabled={disabled} />}
    />
  );
}

export function NotifPrefsView({
  prefs,
  phoneOff,
  onBack,
  onFeed,
  onToggle,
  onOpenSettings,
}: {
  prefs?: NotifPrefs;
  phoneOff?: boolean;
  onBack: () => void;
  onFeed: () => void;
  onToggle: (k: NotifKey, v: boolean) => void;
  onOpenSettings: () => void;
}) {
  const { c, s } = useTheme();
  const hm = (t: string) => t.slice(0, 5);
  const rows: { k: NotifKey; title: string; sub?: string }[] = [
    { k: 'clubs', title: 'Club and room messages', sub: 'Mentions and replies only' },
    { k: 'authors', title: 'Authors you follow', sub: 'New books and posts' },
    { k: 'note_replies', title: 'Replies to your notes' },
    { k: 'reminders', title: 'Reading reminders', sub: "A nudge if you haven't read in 3 days" },
    { k: 'offers', title: 'New arrivals and offers' },
  ];
  return (
    <View>
      <SubHero
        title="Notifications"
        sub="Choose what Arpedia tells you about"
        onBack={onBack}
        action={<IconButton icon="bell" label="Open notification feed" onPress={onFeed} color={c.onOrg} />}
      />
      {phoneOff ? (
        <View style={{ paddingHorizontal: s(16), paddingTop: s(16), gap: s(8) }}>
          <Callout tone="warn">Notifications are off on this phone.</Callout>
          <Btn
            label="Open phone settings"
            variant="g"
            size="sm"
            onPress={onOpenSettings}
            style={{ alignSelf: 'flex-start' }}
          />
        </View>
      ) : null}
      <Section>
        <GroupLabel>Send me</GroupLabel>
        <Group>
          {rows.map((r) =>
            prefs ? (
              <ToggleCell
                key={r.k}
                title={r.title}
                sub={r.sub}
                value={prefs[r.k]}
                onChange={(v) => onToggle(r.k, v)}
              />
            ) : (
              <Cell
                key={r.k}
                title={r.title}
                sub={r.sub}
                trail={<Skeleton width={s(46)} height={28} radius={14} />}
              />
            ),
          )}
        </Group>
      </Section>
      <Section style={{ paddingBottom: s(28) }}>
        <GroupLabel>Quiet hours</GroupLabel>
        <Group>
          {prefs ? (
            <ToggleCell
              title="Pause notifications"
              sub={`${hm(prefs.quiet_start)} to ${hm(prefs.quiet_end)}`}
              value={prefs.quiet_enabled}
              onChange={(v) => onToggle('quiet_enabled', v)}
            />
          ) : (
            <Cell
              title="Pause notifications"
              sub="22:00 to 06:00"
              trail={<Skeleton width={s(46)} height={28} radius={14} />}
            />
          )}
        </Group>
      </Section>
    </View>
  );
}

/* ─── s-security ─────────────────────────────────────────────────────────── */
export interface DeviceRow {
  id: string;
  model: string | null;
  city: string | null;
  last_seen_at: string;
  current: boolean;
  download_enabled: boolean;
}

export interface SecurityData {
  email: string;
  emailVerified: boolean;
  google: boolean;
  hasPassword: boolean;
  /** Download devices in use. */
  enabled?: number;
  devices?: DeviceRow[];
}

export function SecurityView({
  d,
  dateLabel,
  offline,
  onBack,
  onVerify,
  onGoogle,
  onChangePassword,
  onRemove,
}: {
  d: SecurityData;
  dateLabel: (iso: string) => string;
  offline?: boolean;
  onBack: () => void;
  onVerify: () => void;
  onGoogle: () => void;
  onChangePassword: () => void;
  onRemove: (dev: DeviceRow) => void;
}) {
  const { s } = useTheme();
  return (
    <View>
      <SubHero title="Security" sub="Sign-in methods and devices" onBack={onBack} />
      <Section>
        <GroupLabel>Sign-in</GroupLabel>
        <Group>
          <Cell
            title="Email"
            sub={d.email}
            ugc
            trail={
              d.emailVerified ? (
                <Pill label="Verified" tone="ok" />
              ) : (
                <Btn
                  label="Send verification email"
                  variant="g"
                  size="sm"
                  onPress={onVerify}
                  disabled={offline}
                />
              )
            }
          />
          {d.google ? (
            <Cell title="Google" sub="Connected" />
          ) : (
            <Cell
              title="Google"
              trail={<Btn label="Connect" variant="g" size="sm" onPress={onGoogle} disabled={offline} />}
            />
          )}
          {d.hasPassword ? (
            <Cell title="Change password" chevron onPress={offline ? undefined : onChangePassword} />
          ) : (
            <Cell title="Password" sub="You sign in with Google" />
          )}
        </Group>
      </Section>
      <Section>
        <GroupLabel>{`Devices · ${d.enabled ?? '…'} of ${DOWNLOAD_DEVICES}`}</GroupLabel>
        <Group>
          {d.devices === undefined
            ? [0, 1].map((i) => (
                <View key={i} style={{ padding: s(14), gap: s(6) }}>
                  <Skeleton width="50%" height={14} />
                  <Skeleton width="35%" height={12} />
                </View>
              ))
            : d.devices.map((dev) => (
                <Cell
                  key={dev.id}
                  title={dev.model ?? 'Unknown phone'}
                  ugc
                  sub={`${dev.current ? 'This phone' : `Last used ${dateLabel(dev.last_seen_at)}`}${dev.city ? ` · ${dev.city}` : ''}`}
                  trail={
                    dev.current ? undefined : (
                      <Btn
                        label="Remove"
                        variant="g"
                        size="sm"
                        disabled={offline}
                        onPress={() => onRemove(dev)}
                      />
                    )
                  }
                />
              ))}
        </Group>
      </Section>
      <View style={{ paddingHorizontal: s(16), paddingTop: s(16), paddingBottom: s(28) }}>
        <Callout tone="quiet">Downloaded books work on up to 3 devices. Remove one to add another.</Callout>
      </View>
    </View>
  );
}

/** Change password sheet (rule 29): current, then new with the sign-up rule. */
export function PasswordSheet({
  open,
  values,
  errors,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  open: boolean;
  values: { current: string; next: string };
  errors: { current?: string; next?: string; form?: string };
  saving?: boolean;
  onChange: (v: { current: string; next: string }) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Change password" locked={saving}>
      <Field
        label="Current password"
        secureTextEntry
        autoComplete="current-password"
        value={values.current}
        onChangeText={(current) => onChange({ ...values, current })}
        error={errors.current}
      />
      <Field
        label="New password"
        secureTextEntry
        autoComplete="new-password"
        hint="Use at least 8 characters."
        value={values.next}
        onChangeText={(next) => onChange({ ...values, next })}
        error={errors.next}
      />
      {errors.form ? (
        <Text variant="sm" color="err">
          {errors.form}
        </Text>
      ) : null}
      <Text variant="xs" color="ink3">
        Your other devices will be signed out.
      </Text>
      <Btn label="Change password" block loading={saving} onPress={onSave} />
    </Sheet>
  );
}

/* ─── s-about ────────────────────────────────────────────────────────────── */
export function AboutView({
  version,
  build,
  onBack,
  onHelp,
  onCopy,
  onTerms,
  onPrivacy,
  onCopyright,
}: {
  version: string;
  build: string;
  onBack: () => void;
  onHelp: () => void;
  onCopy: () => void;
  onTerms: () => void;
  onPrivacy: () => void;
  onCopyright: () => void;
}) {
  const { s } = useTheme();
  return (
    <View>
      <SubHero title="About Arpedia" sub={`Version ${version} (build ${build})`} onBack={onBack} />
      <Section style={{ paddingBottom: s(28) }}>
        <Group>
          <Cell title="Help centre" sub="Credits, plans, downloads" chevron onPress={onHelp} />
          <Cell
            title="Contact support"
            sub="support@arpedia.africa"
            trail={<Btn label="Copy" variant="g" size="sm" onPress={onCopy} />}
          />
          <Cell title="Terms of Service" chevron onPress={onTerms} />
          <Cell title="Privacy Policy" chevron onPress={onPrivacy} />
          <Cell title="Report a copyright issue" chevron onPress={onCopyright} />
        </Group>
      </Section>
    </View>
  );
}

/* ─── s-delete-account ───────────────────────────────────────────────────── */
export interface DeleteFacts {
  credits?: number;
  finished?: number;
  highlights?: number;
  /** Active store plan name (e.g. "Quarterly"), only when billed through Google Play. */
  storePlan?: string | null;
}

export function deleteLossLine(f: DeleteFacts) {
  const n = (v: number | undefined, one: string, many: string) =>
    `${(v ?? 0).toLocaleString('en-NG')} ${v === 1 ? one : many}`;
  return `Your ${n(f.credits, 'credit', 'credits')}, ${n(f.finished, 'finished book', 'finished books')}, ${n(
    f.highlights,
    'highlight',
    'highlights',
  )} and all messages will be deleted. Unspent credits are not refunded.`;
}

export function DeleteAccountView({
  facts,
  text,
  onText,
  onBack,
  onOpenPlay,
}: {
  facts: DeleteFacts;
  text: string;
  onText: (t: string) => void;
  onBack: () => void;
  onOpenPlay: () => void;
}) {
  const { s } = useTheme();
  return (
    <View>
      <SubHero title="Delete account" sub="This can't be undone." onBack={onBack} />
      <View style={{ paddingHorizontal: s(16), paddingTop: s(16), paddingBottom: s(28), gap: s(16) }}>
        <Callout tone="err">{deleteLossLine(facts)}</Callout>
        {facts.storePlan ? (
          <Press onPress={onOpenPlay} accessibilityRole="link">
            <Callout tone="warn">
              {`Your ${facts.storePlan} plan keeps billing until you cancel it in Google Play. Open Google Play subscriptions`}
            </Callout>
          </Press>
        ) : null}
        <Field
          label="Type DELETE to confirm"
          autoCapitalize="characters"
          autoCorrect={false}
          value={text}
          onChangeText={onText}
        />
      </View>
    </View>
  );
}

export function DeleteAccountFoot({
  text,
  busy,
  offline,
  error,
  onDelete,
  onKeep,
}: {
  text: string;
  busy?: boolean;
  offline?: boolean;
  error?: string;
  onDelete: () => void;
  onKeep: () => void;
}) {
  const { c, s } = useTheme();
  const bottom = useBottomInset(26);
  // `.foot.flat`: padding 12 16 26, gap 8, no top rule
  return (
    <View
      style={{
        paddingTop: s(12),
        paddingHorizontal: s(16),
        paddingBottom: bottom,
        gap: s(8),
        backgroundColor: c.white,
      }}
    >
      <>
        {error ? (
          <Text variant="sm" color="err" style={{ paddingBottom: s(4) }}>
            {error}
          </Text>
        ) : null}
        <Btn
          label="Delete my account"
          variant="x"
          block
          disabled={!deleteConfirmed(text) || offline}
          loading={busy}
          onPress={onDelete}
        />
        <Btn label="Keep my account" variant="g" size="md" block onPress={onKeep} />
      </>
    </View>
  );
}

/** Small "Connect to the internet to do this" line for offline-disabled actions. */
export function OfflineNote() {
  const { s } = useTheme();
  return (
    <Text variant="xs" color="ink3" style={{ paddingHorizontal: s(16), paddingTop: s(8) }}>
      Connect to the internet to do this.
    </Text>
  );
}
