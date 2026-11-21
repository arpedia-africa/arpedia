import { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useNavigation, usePreventRemove } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { Btn, Cell, Group, Screen, Sheet, useTheme, useToast } from '@arpedia/ui';
import { PROFILE_BIO_MAX, normalisePhone, oldEnough, parseDob, validName } from '@arpedia/core';
import { queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { pickAndUploadAvatar } from '../../features/01/photo';
import { profileKey, useSession } from '../../features/01/session';
import { rpcReason, updateProfile } from '../../features/10/data';
import {
  EditProfileFoot,
  EditProfileView,
  type EditErrors,
  type EditValues,
} from '../../features/10/EditProfileViews';

// Flow 10 · Edit profile (s-edit-profile, rules 24–28).
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

const todayIso = () => new Date().toISOString().slice(0, 10);
const dobText = (iso: string | null) => (iso ? iso.split('-').reverse().join(' / ') : '');
const phoneText = (e164: string | null, dial: string) =>
  e164?.startsWith(`+${dial}`) ? e164.slice(dial.length + 1) : (e164 ?? '');

export default function EditProfile() {
  const { s } = useTheme();
  const toast = useToast();
  const nav = useNavigation();
  const { isConnected } = useNetInfo();
  const offline = isConnected === false;
  const session = useSession();
  const uid = session?.user.id;
  const row = useQuery({
    queryKey: ['edit-profile', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, bio, phone, date_of_birth, country, avatar_url')
        .eq('id', uid!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const initial = useMemo<EditValues | null>(() => {
    if (!row.data) return null;
    const dial = COUNTRIES.find((c) => c.code === row.data.country)?.dial ?? '234';
    return {
      name: row.data.full_name,
      bio: row.data.bio ?? '',
      phone: phoneText(row.data.phone, dial),
      dob: dobText(row.data.date_of_birth),
      country: row.data.country || 'NG',
    };
  }, [row.data]);
  const [values, setValues] = useState<EditValues>({ name: '', bio: '', phone: '', dob: '', country: 'NG' });
  const [errors, setErrors] = useState<EditErrors>({});
  const [avatar, setAvatar] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [sheet, setSheet] = useState<'photo' | 'country' | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (initial) {
      setValues(initial);
      setAvatar(row.data?.avatar_url ?? null);
    }
  }, [initial, row.data?.avatar_url]);

  const country = COUNTRIES.find((c) => c.code === values.country) ?? COUNTRIES[0];
  const check: Record<keyof EditValues, () => string | undefined> = {
    name: () => (validName(values.name) ? undefined : 'Enter your name (1 to 80 characters).'),
    bio: () =>
      values.bio.length <= PROFILE_BIO_MAX ? undefined : `Keep it to ${PROFILE_BIO_MAX} characters.`,
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
  const changed =
    !!initial &&
    (Object.keys(values) as (keyof EditValues)[]).some((k) => values[k].trim() !== initial[k].trim());
  const valid = (Object.keys(check) as (keyof EditValues)[]).every((k) => !check[k]());

  // Rule 27: leaving with unsaved changes asks first. After a save (`done`) the screen closes.
  usePreventRemove(changed && !done, ({ data }) =>
    Alert.alert('Discard changes?', 'Your changes to your profile will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => nav.dispatch(data.action) },
    ]),
  );
  useEffect(() => {
    if (done) router.back();
  }, [done]);

  const save = async () => {
    if (!initial) return;
    const errs: EditErrors = {};
    for (const k of Object.keys(check) as (keyof EditValues)[]) errs[k] = check[k]();
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    const patch: Record<string, string | null> = {};
    if (values.name.trim() !== initial.name.trim()) patch.full_name = values.name.trim();
    if (values.bio.trim() !== initial.bio.trim()) patch.bio = values.bio.trim() || null;
    if (values.phone.trim() !== initial.phone.trim() || values.country !== initial.country)
      patch.phone = values.phone.trim() ? normalisePhone(values.phone, country.dial) : null;
    if (values.dob.trim() !== initial.dob.trim())
      patch.date_of_birth = values.dob.trim() ? parseDob(values.dob) : null;
    if (values.country !== initial.country) patch.country = values.country;
    setSaving(true);
    try {
      await updateProfile(patch);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: profileKey(uid) }),
        queryClient.invalidateQueries({ queryKey: ['edit-profile', uid] }),
      ]);
      toast({ message: 'Profile saved' });
      setDone(true);
    } catch (e) {
      const why = rpcReason(e);
      if (why === 'name_change_limit') setErrors({ name: 'You can change your name 3 times in 30 days.' });
      else if (why.includes('phone')) setErrors({ phone: 'Check the phone number.' });
      else if (why.includes('16')) setErrors({ dob: 'You need to be 16 or older to use Arpedia.' });
      else setErrors({ form: "Couldn't save your profile. Try again." });
    } finally {
      setSaving(false);
    }
  };

  const photo = async (source: 'camera' | 'library') => {
    setSheet(null);
    setPhotoBusy(true);
    setErrors((e) => ({ ...e, photo: undefined }));
    try {
      const url = await pickAndUploadAvatar(source);
      if (url) {
        setAvatar(url);
        void queryClient.invalidateQueries({ queryKey: profileKey(uid) });
      }
    } catch {
      setErrors((e) => ({ ...e, photo: 'Photo didn’t upload. Try again.' }));
    } finally {
      setPhotoBusy(false);
    }
  };
  const removePhoto = async () => {
    setSheet(null);
    try {
      await updateProfile({ avatar_url: null });
      setAvatar(null);
      void queryClient.invalidateQueries({ queryKey: profileKey(uid) });
    } catch {
      setErrors((e) => ({ ...e, photo: "Couldn't remove the photo. Try again." }));
    }
  };

  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={
        <EditProfileFoot
          canSave={changed && valid}
          busy={saving}
          offline={offline}
          error={errors.form}
          onSave={() => void save()}
        />
      }
    >
      <EditProfileView
        values={values}
        errors={errors}
        avatarUri={avatar}
        photoBusy={photoBusy}
        countryName={country.name}
        callingCode={country.dial}
        onBack={() => router.back()}
        onChange={(v) => {
          setValues((cur) => ({ ...cur, ...v }));
          setErrors((cur) => ({ ...cur, [Object.keys(v)[0] as string]: undefined, form: undefined }));
        }}
        onBlur={(f) => setErrors((cur) => ({ ...cur, [f]: check[f]() }))}
        onPhoto={() =>
          offline ? toast({ message: 'Connect to the internet to do this.' }) : setSheet('photo')
        }
        onCountry={() => setSheet('country')}
      />
      <Sheet open={sheet === 'photo'} onClose={() => setSheet(null)} title="Change photo">
        <View style={{ gap: s(8) }}>
          <Btn label="Take a photo" variant="s" block onPress={() => void photo('camera')} />
          <Btn label="Choose from gallery" variant="s" block onPress={() => void photo('library')} />
          {avatar ? <Btn label="Remove photo" variant="x" block onPress={() => void removePhoto()} /> : null}
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
