// Flow 10 · Edit profile (s-edit-profile): photo, name, bio, phone, birthday, country.
import { View } from 'react-native';
import { Avatar, Btn, Field, Icon, Press, Text, useBottomInset, useTheme } from '@arpedia/ui';
import { BIO_MAX } from '@arpedia/core';
import { OnbSheet } from '../01/parts';
import { SubHero } from './SettingsViews';

export interface EditValues {
  name: string;
  bio: string;
  phone: string;
  dob: string;
  country: string;
}
export type EditErrors = Partial<Record<keyof EditValues | 'photo' | 'form', string>>;

export function EditProfileView({
  values,
  errors,
  avatarUri,
  photoBusy,
  countryName,
  callingCode,
  onBack,
  onChange,
  onBlur,
  onPhoto,
  onCountry,
}: {
  values: EditValues;
  errors: EditErrors;
  avatarUri?: string | null;
  photoBusy?: boolean;
  countryName: string;
  callingCode: string;
  onBack: () => void;
  onChange: (v: Partial<EditValues>) => void;
  onBlur: (f: keyof EditValues) => void;
  onPhoto: () => void;
  onCountry: () => void;
}) {
  const { c, s } = useTheme();
  return (
    <>
      <SubHero title="Edit profile" sub="Only your name, photo and bio are public." onBack={onBack} />
      <OnbSheet>
        {/* .onb-sheet > .form: padding 22 20 24, gap 16 */}
        <View style={{ paddingTop: s(22), paddingHorizontal: s(20), paddingBottom: s(24), gap: s(16) }}>
          <View style={{ gap: s(6) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(14) }}>
              <Avatar name={values.name || 'Reader'} uri={avatarUri ?? undefined} size="xl" tone="g" />
              <Btn label="Change photo" variant="s" size="sm" icon="image" onPress={onPhoto} loading={photoBusy} />
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
            onBlur={() => onBlur('name')}
            error={errors.name}
            autoCapitalize="words"
            autoComplete="name"
            maxLength={80}
          />
          <Field
            label="Bio"
            value={values.bio}
            onChangeText={(bio) => onChange({ bio })}
            onBlur={() => onBlur('bio')}
            error={errors.bio}
            hint={`${values.bio.length} / ${BIO_MAX}`}
            maxLength={BIO_MAX}
          />
          <Field
            label="Phone number"
            placeholder="803 000 0000"
            value={values.phone}
            onChangeText={(phone) => onChange({ phone })}
            onBlur={() => onBlur('phone')}
            error={errors.phone}
            hint="Private. For account recovery only."
            keyboardType="phone-pad"
            autoComplete="tel"
            leading={
              <Text weight={700} color="ink2" oneLine>
                {`+${callingCode}`}
              </Text>
            }
          />
          <Field
            label="Date of birth"
            placeholder="DD / MM / YYYY"
            value={values.dob}
            onChangeText={(dob) => onChange({ dob })}
            onBlur={() => onBlur('dob')}
            error={errors.dob}
            hint="Private."
            keyboardType="number-pad"
            maxLength={14}
            trailing={<Icon name="cal" size="m" color={c.ink} />}
          />
          <Press onPress={onCountry} accessibilityRole="button" accessibilityLabel={`Country, ${countryName}`}>
            <View pointerEvents="none">
              <Field label="Country" value={countryName} editable={false} trailing={<Icon name="chevd" size="m" color={c.ink} />} />
            </View>
          </Press>
        </View>
      </OnbSheet>
    </>
  );
}

/** `.foot` with Save changes. */
export function EditProfileFoot({
  canSave,
  busy,
  offline,
  error,
  onSave,
}: {
  canSave: boolean;
  busy?: boolean;
  offline?: boolean;
  error?: string;
  onSave: () => void;
}) {
  const { c, s, bw } = useTheme();
  const bottom = useBottomInset(26);
  return (
    <View
      style={{
        paddingTop: s(12),
        paddingHorizontal: s(16),
        paddingBottom: bottom,
        borderTopWidth: bw(1),
        borderTopColor: c.line,
        backgroundColor: c.white,
        gap: s(8),
      }}
    >
      {error || offline ? (
        <Text variant="sm" color={error ? 'err' : 'ink3'}>
          {error ?? 'Connect to the internet to do this.'}
        </Text>
      ) : null}
      <Btn label="Save changes" block disabled={!canSave || offline} loading={busy} onPress={onSave} />
    </View>
  );
}
