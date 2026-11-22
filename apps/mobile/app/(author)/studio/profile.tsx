import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { Btn, Screen, Sheet, useTheme, useToast } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { pickAndUploadAvatar } from '../../../features/01/photo';
import { isNetworkError, useSession } from '../../../features/01/session';
import { STUDIO } from '../../../features/11/application';
import {
  AUTHOR_BIO_MAX,
  AuthorPagePreview,
  StudioProfileFoot,
  StudioProfileView,
  type AuthorProfileValues,
} from '../../../features/11/StudioSettingsViews';

type Errors = Partial<Record<keyof AuthorProfileValues | 'photo' | 'form', string>>;

/** s-studio-profile: pen name, bio, photo, location, visibility and a reader preview (rule 30). */
export default function StudioProfile() {
  const { s } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const net = useNetInfo();
  const uid = useSession()?.user.id;
  const [values, setValues] = useState<AuthorProfileValues | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState<'photo' | 'save' | null>(null);
  const [sheet, setSheet] = useState<'photo' | 'preview' | null>(null);

  useEffect(() => {
    if (!uid) return;
    void supabase
      .from('author_profiles')
      .select('pen_name, bio, location, visibility, photo_url')
      .eq('user_id', uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setErrors({
            form:
              error && isNetworkError(error)
                ? 'You’re offline. Connect to edit your profile.'
                : 'Couldn’t open your profile. Try again.',
          });
          setValues({ pen_name: '', bio: '', location: '', visibility: 'public' });
          return;
        }
        setValues({
          pen_name: data.pen_name,
          bio: data.bio,
          location: data.location ?? '',
          visibility: data.visibility,
        });
        setPhoto(data.photo_url);
      });
  }, [uid]);

  const back = () => (router.canGoBack() ? router.back() : router.replace(STUDIO));

  const pickPhoto = async (source: 'camera' | 'library') => {
    setSheet(null);
    setBusy('photo');
    setErrors((e) => ({ ...e, photo: undefined }));
    try {
      const url = await pickAndUploadAvatar(source);
      if (url) setPhoto(url);
    } catch {
      setErrors((e) => ({ ...e, photo: 'Photo didn’t upload. Try again.' }));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!values || !uid) return;
    const next: Errors = {};
    if (values.pen_name.trim().length < 2) next.pen_name = 'Add the name readers will see.';
    if (values.bio.length > AUTHOR_BIO_MAX) next.bio = `Keep it to ${AUTHOR_BIO_MAX} characters.`;
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy('save');
    const { error } = await supabase
      .from('author_profiles')
      .update({
        pen_name: values.pen_name.trim(),
        bio: values.bio.trim(),
        location: values.location.trim() || null,
        visibility: values.visibility,
        photo_url: photo,
      })
      .eq('user_id', uid);
    setBusy(null);
    if (error) {
      setErrors({
        form: isNetworkError(error)
          ? 'You’re offline. Your changes are still here.'
          : 'Couldn’t save. Try again.',
      });
      return;
    }
    void qc.invalidateQueries({ queryKey: ['studio-home', uid] });
    void qc.invalidateQueries({ queryKey: ['author-profile', uid] });
    toast({ message: 'Profile saved' });
    back();
  };

  const offline = net.isConnected === false;
  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={
        <StudioProfileFoot
          onSave={() => void save()}
          saving={busy === 'save'}
          disabled={!values}
          offline={offline}
        />
      }
    >
      <StudioProfileView
        values={values ?? { pen_name: '', bio: '', location: '', visibility: 'public' }}
        loading={!values}
        photo={photo}
        photoBusy={busy === 'photo'}
        errors={errors}
        onChange={(v) => setValues((cur) => (cur ? { ...cur, ...v } : cur))}
        onPhoto={() => setSheet('photo')}
        onPreview={() => setSheet('preview')}
        onBack={back}
      />
      <Sheet open={sheet === 'photo'} onClose={() => setSheet(null)} title="Change photo">
        <View style={{ gap: s(8) }}>
          <Btn label="Take a photo" variant="s" block onPress={() => void pickPhoto('camera')} />
          <Btn label="Choose from gallery" variant="s" block onPress={() => void pickPhoto('library')} />
        </View>
      </Sheet>
      <Sheet open={sheet === 'preview'} onClose={() => setSheet(null)} title="How readers see you">
        {values ? <AuthorPagePreview values={values} photo={photo} /> : null}
      </Sheet>
    </Screen>
  );
}
