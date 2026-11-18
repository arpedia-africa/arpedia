import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Btn, Cell, Group, Screen, Sheet, useTheme } from '@arpedia/ui';
import { normalisePhone, oldEnough, parseDob, validName } from '@arpedia/core';
import { useQueryClient } from '@tanstack/react-query';
import { ProfileFoot, ProfileView, type ProfileValues } from '../../features/01/StepViews';
import { useTrack } from '../../features/01/analytics';
import { pickAndUploadAvatar } from '../../features/01/photo';
import { profileKey, useMyProfile, useSession } from '../../features/01/session';
import { saveStep } from '../../features/01/steps';

// Countries readers come from most; the phone prefix follows the country (Q10 default).
const COUNTRIES = [
  { code: 'NG', name: 'Nigeria', dial: '234' },
  { code: 'GH', name: 'Ghana', dial: '233' },
  { code: 'KE', name: 'Kenya', dial: '254' },
  { code: 'ZA', name: 'South Africa', dial: '27' },
  { code: 'CM', name: 'Cameroon', dial: '237' },
  { code: 'GB', name: 'United Kingdom', dial: '44' },
  { code: 'US', name: 'United States', dial: '1' },
  { code: 'CA', name: 'Canada', dial: '1' },
] as const;

type Errors = Partial<Record<keyof ProfileValues | 'photo', string>>;
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function ProfileSetup() {
  const { s } = useTheme();
  const track = useTrack();
  const qc = useQueryClient();
  const session = useSession();
  const uid = session?.user.id;
  const profile = useMyProfile(uid);
  const [values, setValues] = useState<ProfileValues>({ name: '', phone: '', dob: '', country: 'NG' });
  const [errors, setErrors] = useState<Errors>({});
  const [avatar, setAvatar] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [sheet, setSheet] = useState<'photo' | 'country' | null>(null);
  const [touched, setTouched] = useState(false);

  // The name carries over from sign-up or Google, so Continue is ready (rule 21).
  useEffect(() => {
    if (profile.data && !touched) {
      setValues((v) => ({ ...v, name: profile.data.full_name, country: profile.data.country || 'NG' }));
      setAvatar(profile.data.avatar_url);
    }
  }, [profile.data, touched]);
  useEffect(() => track('onboarding_step_viewed', { step: 'profile' }), [track]);

  const country = COUNTRIES.find((c) => c.code === values.country) ?? COUNTRIES[0];
  const check: Record<keyof ProfileValues, () => string | undefined> = {
    name: () => (validName(values.name) ? undefined : 'Enter your name.'),
    phone: () =>
      !values.phone.trim() || normalisePhone(values.phone, country.dial)
        ? undefined
        : 'Check the phone number.',
    dob: () => {
      if (!values.dob.trim()) return undefined;
      const iso = parseDob(values.dob);
      if (!iso) return 'Use DD / MM / YYYY.';
      return oldEnough(iso, todayIso()) ? undefined : 'You need to be 16 or older to use Arpedia.';
    },
    country: () => undefined,
  };

  const next = () => router.push('/(onboarding)/plans');
  const cont = () => {
    const errs: Errors = { name: check.name(), phone: check.phone(), dob: check.dob() };
    setErrors(errs);
    if (errs.name || errs.phone || errs.dob) return;
    const payload: Record<string, string> = { full_name: values.name.trim(), country: values.country };
    const phone = values.phone.trim() && normalisePhone(values.phone, country.dial);
    const dob = values.dob.trim() && parseDob(values.dob);
    if (phone) payload.phone = phone;
    if (dob) payload.date_of_birth = dob;
    track('profile_completed', {
      photo: !!avatar,
      phone: !!phone,
      birthday: !!dob,
      country: values.country !== 'NG',
    });
    void saveStep('profile', payload);
    next();
  };

  const photo = async (source: 'camera' | 'library') => {
    setSheet(null);
    setPhotoBusy(true);
    setErrors((e) => ({ ...e, photo: undefined }));
    try {
      const url = await pickAndUploadAvatar(source);
      if (url) {
        setAvatar(url);
        void qc.invalidateQueries({ queryKey: profileKey(uid) });
      }
    } catch {
      setErrors((e) => ({ ...e, photo: 'Photo didn’t upload. Try again.' }));
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={
        <ProfileFoot
          canContinue={validName(values.name)}
          onContinue={cont}
          onSkip={() => {
            track('onboarding_step_skipped', { step: 'profile' });
            void saveStep('profile');
            next();
          }}
        />
      }
    >
      <ProfileView
        values={values}
        errors={errors}
        avatarUri={avatar}
        photoBusy={photoBusy}
        countryName={country.name}
        callingCode={country.dial}
        onChange={(v) => {
          setTouched(true);
          setValues((cur) => ({ ...cur, ...v }));
          setErrors((cur) => ({ ...cur, [Object.keys(v)[0] as string]: undefined }));
        }}
        onBlur={(f) => setErrors((cur) => ({ ...cur, [f]: check[f]() }))}
        onPhoto={() => setSheet('photo')}
        onCountry={() => setSheet('country')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(onboarding)/role'))}
      />
      <Sheet open={sheet === 'photo'} onClose={() => setSheet(null)} title="Add photo">
        <View style={{ gap: s(8), paddingHorizontal: s(16), paddingBottom: s(16) }}>
          <Btn label="Take a photo" variant="s" block onPress={() => void photo('camera')} />
          <Btn label="Choose from gallery" variant="s" block onPress={() => void photo('library')} />
        </View>
      </Sheet>
      <Sheet open={sheet === 'country'} onClose={() => setSheet(null)} title="Country">
        <Group>
          {COUNTRIES.map((c) => (
            <Cell
              key={c.code}
              title={c.name}
              sub={`+${c.dial}`}
              onPress={() => {
                setTouched(true);
                setValues((v) => ({ ...v, country: c.code }));
                setErrors((e) => ({ ...e, phone: undefined }));
                setSheet(null);
              }}
            />
          ))}
        </Group>
      </Sheet>
    </Screen>
  );
}
