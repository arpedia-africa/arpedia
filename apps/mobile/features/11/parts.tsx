import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, IconButton, OnHero, Petals, Press, Text, Toggle, useTheme } from '@arpedia/ui';
import { HeroSub, HeroTitle } from '../01/parts';

// Flow 11 pieces that mirror prototype elements one to one (`node tools/screen.mjs s-apply --css`).

/** `.hero.sub-hero`: back bar (optional action on the right), title and sub; body padding 4 16 44, gap 12. */
export function SubHero({
  title,
  sub,
  onBack,
  action,
  children,
}: {
  title: string;
  sub: string;
  onBack?: () => void;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const { c, s } = useTheme();
  return (
    <OnHero.Provider value>
      <View style={{ backgroundColor: c.org, overflow: 'hidden' }}>
        <Petals size={s(260)} style={{ right: s(-110), top: s(-90) }} />
        <View
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: s(52), paddingHorizontal: s(6) }}
        >
          {onBack ? <IconButton icon="back" label="Back" onPress={onBack} color={c.onOrg} /> : null}
          <View style={{ flex: 1 }} />
          {action}
        </View>
        <View style={{ paddingTop: s(4), paddingHorizontal: s(16), paddingBottom: s(44), gap: s(12) }}>
          <HeroTitle>{title}</HeroTitle>
          <HeroSub>{sub}</HeroSub>
          {children}
        </View>
      </View>
    </OnHero.Provider>
  );
}

/** `.hero.hero--low`: close on the right, petals bottom-left; body padding 4 16 20, gap 12. */
export function LowHero({ title, sub, onClose }: { title: string; sub: string; onClose?: () => void }) {
  const { c, s } = useTheme();
  return (
    <OnHero.Provider value>
      <View style={{ backgroundColor: c.org, overflow: 'hidden' }}>
        <Petals size={s(260)} style={{ left: s(-110), bottom: s(-130) }} />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: s(52),
            paddingLeft: s(16),
            paddingRight: s(6),
          }}
        >
          <View style={{ flex: 1 }} />
          {onClose ? <IconButton icon="x" label="Close" onPress={onClose} color={c.onOrg} /> : null}
        </View>
        <View style={{ paddingTop: s(4), paddingHorizontal: s(16), paddingBottom: s(20), gap: s(12) }}>
          <HeroTitle>{title}</HeroTitle>
          <HeroSub>{sub}</HeroSub>
        </View>
      </View>
    </OnHero.Provider>
  );
}

/** `.hero.onb-step` with a 4-step track ("N of 4"): flow 01's band, application steps. */
export function StepHero({
  step,
  title,
  sub,
  onBack,
}: {
  step: 1 | 2 | 3 | 4;
  title: string;
  sub: string;
  onBack?: () => void;
}) {
  const { c, s } = useTheme();
  return (
    <OnHero.Provider value>
      <View style={{ backgroundColor: c.org, overflow: 'hidden' }}>
        <Petals size={s(260)} style={{ right: s(-120), top: s(-110) }} />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(2),
            minHeight: s(52),
            paddingHorizontal: s(6),
          }}
        >
          {onBack ? (
            <IconButton icon="back" label="Back" onPress={onBack} color={c.onOrg} />
          ) : (
            <View style={{ width: s(44), height: s(44) }} />
          )}
          {/* .onb-progress: 6px track, night fill = step/4 */}
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 1, max: 4, now: step }}
            style={{
              flex: 1,
              height: s(6),
              borderRadius: s(6),
              backgroundColor: 'rgba(26,17,0,0.14)',
              marginHorizontal: s(4),
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${(step / 4) * 100}%`,
                height: '100%',
                borderRadius: s(6),
                backgroundColor: c.night,
              }}
            />
          </View>
          <Text
            size={12.5}
            weight={700}
            color="onOrg"
            tabular
            oneLine
            style={{ paddingLeft: s(6), paddingRight: s(10) }}
          >
            {`${step} of 4`}
          </Text>
        </View>
        <View style={{ paddingTop: s(2), paddingHorizontal: s(20), paddingBottom: s(40), gap: s(8) }}>
          <HeroTitle>{title}</HeroTitle>
          <HeroSub>{sub}</HeroSub>
        </View>
      </View>
    </OnHero.Provider>
  );
}

/** `.st-steps`: numbered night discs (28, gold 13/800), title 14.5 bold, line 13 ink-2; gap 12. */
export function StSteps({ items }: { items: { title: string; sub: string }[] }) {
  const { c, s } = useTheme();
  return (
    <View style={{ gap: s(12) }}>
      {items.map((it, i) => (
        <View key={it.title} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: s(12) }}>
          <View
            style={{
              width: s(28),
              height: s(28),
              borderRadius: s(14),
              backgroundColor: c.night,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text size={13} weight={800} color="#FFD27A" tabular oneLine>
              {String(i + 1)}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text size={14.5} weight={700} style={{ lineHeight: s(14.5) * 1.45 }}>
              {it.title}
            </Text>
            <Text size={13} color="ink2" style={{ lineHeight: s(13) * 1.45 }}>
              {it.sub}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** `.timeline`: steps with a 2px rule at left 17 (green once done); title 15/600, date 12 ink-3. */
export function Timeline({ steps }: { steps: { title: string; sub: string; done?: boolean }[] }) {
  const { c, s } = useTheme();
  return (
    <View>
      {steps.map((st, i) => {
        const last = i === steps.length - 1;
        return (
          <View key={st.title} style={{ flexDirection: 'row', gap: s(12), paddingBottom: last ? 0 : s(18) }}>
            {!last ? (
              <View
                style={{
                  position: 'absolute',
                  left: s(17),
                  top: s(38),
                  bottom: s(2),
                  width: s(2),
                  backgroundColor: st.done ? c.ok : c.line,
                }}
              />
            ) : null}
            <View style={{ gap: s(4) }}>
              <Text size={15} weight={600} oneLine style={{ lineHeight: s(15) * 1.3 }}>
                {st.title}
              </Text>
              <Text size={12} color="ink3" oneLine style={{ lineHeight: s(12) * 1.4 }}>
                {st.sub}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** `label.h12.h-top.t-sm`: toggle + 13.5/1.45 text, top-aligned. */
export function AgreeRow({
  value,
  onChange,
  children,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  children: string;
}) {
  const { s } = useTheme();
  return (
    <Press
      onPress={() => onChange(!value)}
      pressScale={1}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: s(12) }}
    >
      <Toggle value={value} onChange={onChange} label="I agree" />
      <Text size={13.5} style={{ flex: 1, lineHeight: s(13.5) * 1.45 }}>
        {children}
      </Text>
    </Press>
  );
}

/** `span.h6.t-xs.t-muted` with the cloud icon: "Draft saves as you type". */
export function SavedLine({ label }: { label: string }) {
  const { c, s } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }} accessibilityLiveRegion="polite">
      <Icon name="cloud" size="m" color={c.ink3} />
      <Text size={12} color="ink3" oneLine style={{ lineHeight: s(12) * 1.4 }}>
        {label}
      </Text>
    </View>
  );
}

/** `.t-label` (13/600) above a block, with `.v8` spacing. */
export function LabelBlock({ label, children }: { label: string; children: ReactNode }) {
  const { s } = useTheme();
  return (
    <View style={{ gap: s(8) }}>
      <Text size={13} weight={600} oneLine>
        {label}
      </Text>
      {children}
    </View>
  );
}
