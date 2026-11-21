import { View } from 'react-native';
import {
  Avatar,
  Btn,
  Callout,
  Cell,
  Field,
  Group,
  GroupLabel,
  KeyValue,
  Pill,
  Press,
  Section,
  Segmented,
  Skeleton,
  Text,
  Toggle,
  useTheme,
  type PillTone,
} from '@arpedia/ui';
import { formatKobo, MIN_PAYOUT_KOBO } from '@arpedia/core';
import { OnbSheet } from '../01/parts';
import { Foot } from '../01/StepViews';
import { SubHero } from './parts';

// s-studio-profile, s-studio-payout, s-studio-community. Pure views for the routes and tools/parity
// (`node tools/screen.mjs s-studio-profile s-studio-payout s-studio-community --css`).

// ─── s-studio-profile ───────────────────────────────────────────────────────
export interface AuthorProfileValues {
  pen_name: string;
  bio: string;
  location: string;
  visibility: 'public' | 'private';
}

export const AUTHOR_BIO_MAX = 300;

export function StudioProfileView({
  values,
  photo,
  photoBusy,
  loading,
  errors,
  onChange,
  onPhoto,
  onPreview,
  onBack,
}: {
  values: AuthorProfileValues;
  photo: string | null;
  photoBusy?: boolean;
  loading?: boolean;
  errors: Partial<Record<keyof AuthorProfileValues | 'photo' | 'form', string>>;
  onChange: (v: Partial<AuthorProfileValues>) => void;
  onPhoto: () => void;
  onPreview: () => void;
  onBack: () => void;
}) {
  const { s } = useTheme();
  return (
    <>
      <SubHero
        title="Author profile"
        sub="What readers see on your page"
        onBack={onBack}
        action={
          // .pill.night as a link, 44px touch target around it
          <Press
            onPress={onPreview}
            accessibilityRole="link"
            accessibilityLabel="Preview your author page"
            hitSlop={8}
            style={{ paddingRight: s(10) }}
          >
            <Pill label="Preview" tone="night" />
          </Press>
        }
      />
      <OnbSheet>
        <View style={{ paddingTop: s(22), paddingHorizontal: s(20), paddingBottom: s(24), gap: s(16) }}>
          {loading ? (
            <View style={{ gap: s(16) }} accessibilityLabel="Loading">
              <Skeleton width={s(88)} height={s(88)} radius={999} />
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ gap: s(6) }}>
                  <Skeleton width="30%" height={s(13)} />
                  <Skeleton height={s(i === 1 ? 82 : 50)} radius={s(12)} />
                </View>
              ))}
            </View>
          ) : (
            <>
              {errors.form ? <Callout tone="err">{errors.form}</Callout> : null}
              {/* .onb-avatar: av.xl (88) + Change photo, gap 14 */}
              <View style={{ gap: s(6) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(14) }}>
                  <Avatar name={values.pen_name || 'Author'} uri={photo ?? undefined} size="xl" tone="m" />
                  <Btn
                    label="Change photo"
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
                label="Pen name"
                value={values.pen_name}
                onChangeText={(pen_name) => onChange({ pen_name })}
                error={errors.pen_name}
                autoCapitalize="words"
                maxLength={60}
              />
              <Field
                label="Bio"
                value={values.bio}
                onChangeText={(bio) => onChange({ bio })}
                error={errors.bio}
                hint={`${values.bio.length}/${AUTHOR_BIO_MAX}`}
                maxLength={AUTHOR_BIO_MAX}
                multiline
                rows={3}
              />
              <Field
                label="Location"
                value={values.location}
                onChangeText={(location) => onChange({ location })}
                error={errors.location}
                autoCapitalize="words"
                maxLength={80}
              />
              <Cell
                title="Public profile"
                sub={
                  values.visibility === 'public'
                    ? 'Anyone can find and follow you'
                    : 'Only readers with your link can see your page'
                }
                trail={
                  <Toggle
                    value={values.visibility === 'public'}
                    onChange={(on) => onChange({ visibility: on ? 'public' : 'private' })}
                    label="Public profile"
                  />
                }
              />
            </>
          )}
        </View>
      </OnbSheet>
    </>
  );
}

export function StudioProfileFoot({
  onSave,
  saving,
  disabled,
  offline,
}: {
  onSave: () => void;
  saving?: boolean;
  disabled?: boolean;
  offline?: boolean;
}) {
  return (
    <Foot>
      <Btn
        label={offline ? 'Connect to save' : 'Save'}
        block
        onPress={onSave}
        loading={saving}
        disabled={disabled || offline}
      />
    </Foot>
  );
}

/** Reader preview of the author page (rule 30): name, location, bio as readers see them. */
export function AuthorPagePreview({ values, photo }: { values: AuthorProfileValues; photo: string | null }) {
  const { s } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: s(10), paddingBottom: s(8) }}>
      <Avatar name={values.pen_name || 'Author'} uri={photo ?? undefined} size="xl" tone="m" />
      <Text variant="h2" center ellipsis>
        {values.pen_name || 'Your pen name'}
      </Text>
      {values.location ? (
        <Text size={13} color="ink3" center oneLine>
          {values.location}
        </Text>
      ) : null}
      <Text size={14} color="ink2" center style={{ lineHeight: s(14) * 1.5 }}>
        {values.bio || 'Your bio shows here.'}
      </Text>
      {values.visibility === 'private' ? (
        <Pill label="Private: only people with your link" tone="grey" />
      ) : null}
    </View>
  );
}

// ─── s-studio-payout ────────────────────────────────────────────────────────
export interface PayoutAccountModel {
  /** "GTBank ···· 2291", or null when no account is set. */
  bank: string | null;
  name: string | null;
  status: { label: string; tone: PillTone };
}

export function StudioPayoutView({
  account,
  onBack,
  onChange,
}: {
  account: PayoutAccountModel;
  onBack: () => void;
  onChange: () => void;
}) {
  const { s } = useTheme();
  return (
    <>
      <SubHero title="Payout account" sub="Where your earnings are paid" onBack={onBack} />
      <View style={{ paddingTop: s(16), paddingHorizontal: s(16), paddingBottom: s(28), gap: s(16) }}>
        {/* .group keeps its own 16px margin inside .inset (the prototype's 32px indent) */}
        <Group>
          <Cell
            title={account.bank ?? 'No bank account yet'}
            sub={account.name ?? 'Add one to get paid on the 15th'}
            trail={<Pill label={account.status.label} tone={account.status.tone} />}
          />
        </Group>
        <KeyValue
          rows={[
            { k: 'Payout day', v: '15th of each month' },
            { k: 'Method', v: 'Bank transfer' },
            { k: 'Minimum', v: formatKobo(MIN_PAYOUT_KOBO) },
          ]}
        />
        <Callout tone="info">Changing account pauses payouts for 48 hours for safety.</Callout>
        <Btn
          label={account.bank ? 'Change account' : 'Add bank account'}
          variant="g"
          size="md"
          block
          onPress={onChange}
        />
      </View>
    </>
  );
}

// ─── s-studio-community ─────────────────────────────────────────────────────
export type WhoCanPost = 'everyone' | 'only_me' | 'moderators';

export interface ClubSettingsValues {
  who: WhoCanPost;
  publicClub: boolean;
  slowMode: boolean;
}

export function StudioClubView({
  title,
  sub,
  values,
  notReady,
  onChange,
  onBack,
  onMuted,
  onModerators,
  mutedSub = 'Hide messages with words you choose',
  moderatorsSub = 'People who help you run the club',
}: {
  title: string;
  sub: string;
  values: ClubSettingsValues;
  mutedSub?: string;
  moderatorsSub?: string;
  /** The club opens with community chat (flow 06): controls show but cannot save yet. */
  notReady?: boolean;
  onChange: (v: Partial<ClubSettingsValues>) => void;
  onBack: () => void;
  onMuted: () => void;
  onModerators: () => void;
}) {
  const { s } = useTheme();
  return (
    <>
      <SubHero title={title} sub={sub} onBack={onBack} />
      <View style={{ paddingTop: s(16), paddingHorizontal: s(16), gap: s(8) }}>
        {notReady ? (
          <View style={{ paddingBottom: s(8) }}>
            <Callout tone="info">
              Your club opens when community chat launches. These settings apply then.
            </Callout>
          </View>
        ) : null}
        <Text size={13} weight={600} oneLine>
          Who can post
        </Text>
        <Segmented<WhoCanPost>
          options={[
            { value: 'everyone', label: 'Everyone' },
            { value: 'only_me', label: 'Only me' },
            { value: 'moderators', label: 'Moderators' },
          ]}
          value={values.who}
          onChange={(who) => onChange({ who })}
        />
      </View>
      <Section style={{ paddingBottom: s(28) }}>
        <GroupLabel>Club</GroupLabel>
        <Group>
          <Cell
            title="Public club"
            sub={values.publicClub ? 'Anyone can find and join' : 'Only people you invite can join'}
            trail={
              <Toggle
                value={values.publicClub}
                onChange={(publicClub) => onChange({ publicClub })}
                label="Public club"
              />
            }
          />
          <Cell
            title="Slow mode"
            sub="One message per 30 seconds"
            trail={
              <Toggle
                value={values.slowMode}
                onChange={(slowMode) => onChange({ slowMode })}
                label="Slow mode"
              />
            }
          />
          <Cell title="Muted words" sub={mutedSub} chevron onPress={onMuted} />
          <Cell title="Moderators" sub={moderatorsSub} chevron onPress={onModerators} />
        </Group>
      </Section>
    </>
  );
}
