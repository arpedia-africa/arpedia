import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  Avatar,
  Btn,
  Field,
  Icon,
  Press,
  Text,
  THEMES,
  themeMeta,
  themes,
  useBottomInset,
  useTheme,
  type ThemeName,
} from '@arpedia/ui';
import { OnbSheet, OnbStepHero } from './parts';

// s-interests, s-theme, s-role, s-profile-setup bodies. Pure views for the routes and tools/parity.

/** `.foot`: pinned, padding 12 16 26, top rule, gap 8. */
export function Foot({ children }: { children: ReactNode }) {
  const { c, s } = useTheme();
  const bottom = useBottomInset(26);
  return (
    <View
      style={{
        paddingTop: s(12),
        paddingHorizontal: s(16),
        paddingBottom: bottom,
        borderTopWidth: 1,
        borderTopColor: c.line,
        backgroundColor: c.white,
        gap: s(8),
      }}
    >
      {children}
    </View>
  );
}

// ─── s-interests ────────────────────────────────────────────────────────────
export interface GenreOption {
  id: string;
  name: string;
}

/** `.onb-chip`: 44 tall pill, 14/600; picked = tint, main-colour ring and a tick. */
function OnbChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { c, s, bw } = useTheme();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={{
        minHeight: s(44),
        paddingHorizontal: s(16),
        borderRadius: s(999),
        backgroundColor: on ? c.orgTint : c.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(6),
        ...(on ? { borderWidth: bw(1.5), borderColor: c.org, paddingHorizontal: s(16) - bw(1.5) } : null),
      }}
    >
      {/* .ico.xs.onb-chip__tick: 15px, shown only when picked */}
      {on ? <Icon name="check" size="xs" color={c.orgInk} /> : null}
      <Text size={14} weight={600} color={on ? 'orgInk' : 'ink'} oneLine>
        {label}
      </Text>
    </Press>
  );
}

export function InterestsView({
  genres,
  picked,
  onToggle,
  onBack,
}: {
  genres: GenreOption[];
  picked: Set<string>;
  onToggle: (id: string) => void;
  onBack?: () => void;
}) {
  const { s } = useTheme();
  return (
    <>
      <OnbStepHero
        step={1}
        onBack={onBack}
        title="Choose the genres you love"
        sub="Pick a few for better recommendations, or skip it."
      />
      <OnbSheet>
        {/* .onb-chips: wrap, gap 10, padding 26 20 24 */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: s(10),
            paddingTop: s(26),
            paddingHorizontal: s(20),
            paddingBottom: s(24),
          }}
        >
          {genres.map((g) => (
            <OnbChip key={g.id} label={g.name} on={picked.has(g.id)} onPress={() => onToggle(g.id)} />
          ))}
        </View>
      </OnbSheet>
    </>
  );
}

export function InterestsFoot({
  onSkip,
  onContinue,
  busy,
}: {
  onSkip: () => void;
  onContinue: () => void;
  busy?: boolean;
}) {
  const { s } = useTheme();
  return (
    <Foot>
      {/* .btn-grid: two equal columns, gap 8 */}
      <View style={{ flexDirection: 'row', gap: s(8) }}>
        <View style={{ flex: 1 }}>
          <Btn label="Skip" variant="s" icon="x" block onPress={onSkip} disabled={busy} />
        </View>
        <View style={{ flex: 1 }}>
          <Btn label="Continue" iconAfter="arrow" block onPress={onContinue} loading={busy} />
        </View>
      </View>
    </Foot>
  );
}

// ─── s-theme ────────────────────────────────────────────────────────────────
// Each tile is drawn in its own theme: fill = main colour, text = on-main, dots = accent + star gold.
// Petals (--pc) use the current theme's petal colour: .8 × petal-k on Sunflower, .45 × petal-k on the rest.

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

/** `.th-tile`: square, radius 22, padding 16, name 19/800 display, feel 12.5/1.3 at 88%. */
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
          // .th-check: 26 white disc, top-left 12, drawn tick
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
            {/* ::after isn't covered by the `*{box-sizing:border-box}` reset: 10×5 content + 2px borders */}
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
        {/* .th-acc: two 14px dots, gap 5, margin-bottom 8 */}
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

export function ThemeView({
  value,
  onPick,
  onBack,
  onSkip,
  onContinue,
}: {
  value: ThemeName;
  onPick: (t: ThemeName) => void;
  onBack?: () => void;
  onSkip: () => void;
  onContinue: () => void;
}) {
  const { s } = useTheme();
  const rows = [THEMES.slice(0, 2), THEMES.slice(2, 4)];
  return (
    <>
      <OnbStepHero
        onBack={onBack}
        onSkip={onSkip}
        title="Pick your colour"
        sub="Make Arpedia feel like yours. You can change it later."
      />
      {/* Prototype inline styles: sheet padding-top 20, gap 16; button wrapper padding 4 16 24 */}
      <OnbSheet style={{ paddingTop: s(20), paddingBottom: s(24), gap: s(16) }}>
        <View accessibilityRole="radiogroup" style={{ gap: s(12), paddingHorizontal: s(16) }}>
          {rows.map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: s(12) }}>
              {row.map((t) => (
                <ThemeTile key={t} name={t} selected={t === value} onPress={() => onPick(t)} />
              ))}
            </View>
          ))}
        </View>
        <View style={{ paddingHorizontal: s(16), paddingTop: s(4) }}>
          <Btn label="Continue" block onPress={onContinue} />
        </View>
      </OnbSheet>
    </>
  );
}

// ─── s-role ─────────────────────────────────────────────────────────────────
export type Intent = 'reader' | 'author';
const ROLES: { id: Intent; title: string; sub: string }[] = [
  {
    id: 'reader',
    title: "I'm a reader",
    sub: 'Discover, read, and follow authors. You can switch to author mode anytime.',
  },
  {
    id: 'author',
    title: "I'm an author",
    sub: 'Publish and manage your books in the Author Studio, and reach your readers.',
  },
];

/** `.option` in `.onb-roles`: padding 16, gap 14, top-aligned; picked = tint-2 with a 2px ring. */
function RoleOption({
  title,
  sub,
  on,
  onPress,
}: {
  title: string;
  sub: string;
  on: boolean;
  onPress: () => void;
}) {
  const { c, s, bw } = useTheme();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: s(14),
        minHeight: s(56),
        borderRadius: s(14),
        backgroundColor: on ? c.orgTint2 : c.white,
        // border 1px (transparent when picked) + padding 16
        borderWidth: bw(1),
        borderColor: on ? 'transparent' : c.line,
        padding: s(16),
      }}
    >
      {/* picked: box-shadow inset 0 0 0 2px org, inside the border */}
      {on ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: s(14) - bw(1),
            borderWidth: s(2),
            borderColor: c.org,
          }}
        />
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: s(2) }}>
        <Text size={15.5} weight={700}>
          {title}
        </Text>
        <Text size={13} color="ink2" style={{ lineHeight: s(13) * 1.45 }}>
          {sub}
        </Text>
      </View>
      {/* .onb-tick: 24 circle, grey ring; picked = main colour with a tick */}
      <View
        style={{
          width: s(24),
          height: s(24),
          borderRadius: s(12),
          marginTop: s(10),
          alignItems: 'center',
          justifyContent: 'center',
          ...(on ? { backgroundColor: c.org } : { borderWidth: s(2), borderColor: '#D1D5DB' }),
        }}
      >
        {on ? <Icon name="check" size="xs" color={c.onOrg} /> : null}
      </View>
    </Press>
  );
}

export function RoleView({
  value,
  onPick,
  onBack,
}: {
  value: Intent | null;
  onPick: (v: Intent) => void;
  onBack?: () => void;
}) {
  const { s } = useTheme();
  return (
    <>
      <OnbStepHero
        step={2}
        onBack={onBack}
        title="How will you use Arpedia?"
        sub="Pick one to start. You can always switch later."
      />
      <OnbSheet>
        <View
          accessibilityRole="radiogroup"
          style={{ gap: s(12), paddingTop: s(26), paddingHorizontal: s(20), paddingBottom: s(24) }}
        >
          {ROLES.map((r) => (
            <RoleOption
              key={r.id}
              title={r.title}
              sub={r.sub}
              on={value === r.id}
              onPress={() => onPick(r.id)}
            />
          ))}
        </View>
      </OnbSheet>
    </>
  );
}

// ─── s-profile-setup ────────────────────────────────────────────────────────
export interface ProfileValues {
  name: string;
  phone: string;
  dob: string;
  country: string;
}

export function ProfileView({
  values,
  errors,
  avatarUri,
  photoBusy,
  countryName,
  callingCode,
  onChange,
  onBlur,
  onPhoto,
  onCountry,
  onBack,
}: {
  values: ProfileValues;
  errors: Partial<Record<keyof ProfileValues | 'photo', string>>;
  avatarUri?: string | null;
  photoBusy?: boolean;
  countryName: string;
  callingCode: string;
  onChange: (v: Partial<ProfileValues>) => void;
  onBlur?: (f: keyof ProfileValues) => void;
  onPhoto: () => void;
  onCountry: () => void;
  onBack?: () => void;
}) {
  const { c, s } = useTheme();
  return (
    <>
      <OnbStepHero
        step={3}
        onBack={onBack}
        title="Complete your profile"
        sub="Only you can see this. Optional, you can finish it later."
      />
      <OnbSheet>
        <View style={{ paddingTop: s(22), paddingHorizontal: s(20), paddingBottom: s(24), gap: s(16) }}>
          {/* .onb-avatar: av.xl (88) + Add photo, gap 14 */}
          <View style={{ gap: s(6) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(14) }}>
              <Avatar name={values.name || 'Reader'} uri={avatarUri ?? undefined} size="xl" tone="g" />
              <Btn
                label="Add photo"
                variant="s"
                size="sm"
                icon="image"
                onPress={onPhoto}
                loading={photoBusy}
              />
            </View>
            {errors.photo ? (
              <Text size={12} weight={500} color="err">
                {errors.photo}
              </Text>
            ) : null}
          </View>
          <Field
            label="Full name"
            value={values.name}
            onChangeText={(name) => onChange({ name })}
            onBlur={() => onBlur?.('name')}
            error={errors.name}
            autoCapitalize="words"
            autoComplete="name"
            maxLength={80}
          />
          <Field
            label="Phone number"
            placeholder="803 000 0000"
            value={values.phone}
            onChangeText={(phone) => onChange({ phone })}
            onBlur={() => onBlur?.('phone')}
            error={errors.phone}
            hint="For account recovery only. Never shown to others."
            keyboardType="phone-pad"
            autoComplete="tel"
            leading={
              <Text weight={600} color="ink2" oneLine>
                {`+${callingCode}`}
              </Text>
            }
          />
          <Field
            label="Date of birth"
            placeholder="DD / MM / YYYY"
            value={values.dob}
            onChangeText={(dob) => onChange({ dob })}
            onBlur={() => onBlur?.('dob')}
            error={errors.dob}
            hint="Helps us suggest age-appropriate books."
            keyboardType="number-pad"
            maxLength={14}
            trailing={<Icon name="cal" size="m" color={c.ink} />}
          />
          <Press
            onPress={onCountry}
            accessibilityRole="button"
            accessibilityLabel={`Country, ${countryName}`}
          >
            <View pointerEvents="none">
              <Field
                label="Country"
                value={countryName}
                editable={false}
                trailing={<Icon name="chevd" size="m" color={c.ink} />}
              />
            </View>
          </Press>
        </View>
      </OnbSheet>
    </>
  );
}

export function ProfileFoot({
  canContinue,
  busy,
  onContinue,
  onSkip,
}: {
  canContinue: boolean;
  busy?: boolean;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const { s } = useTheme();
  return (
    <Foot>
      <Btn
        label="Continue"
        iconAfter="arrow"
        block
        onPress={onContinue}
        disabled={!canContinue}
        loading={busy}
      />
      {/* .link.t-center.onb-skip */}
      <Press
        onPress={onSkip}
        accessibilityRole="link"
        style={{ paddingVertical: s(6), alignItems: 'center' }}
      >
        <Text size={14} weight={700} color="orgInk" oneLine>
          Skip for now
        </Text>
      </Press>
    </Foot>
  );
}
