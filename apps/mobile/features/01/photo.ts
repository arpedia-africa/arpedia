import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

const api = process.env.EXPO_PUBLIC_API_URL ?? '';

/**
 * Pick (camera or gallery), square-crop, resize to 512×512 WebP on the phone, upload through the
 * Worker's signed URL (rule 22). Returns the new avatar URL, or null if the reader cancelled.
 */
export async function pickAndUploadAvatar(source: 'camera' | 'library'): Promise<string | null> {
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  };
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
  }
  const res =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets[0]) return null;

  // Shrink until under 200 KB (quality steps), always 512×512 WebP.
  let file: ImageManipulator.ImageResult | null = null;
  for (const compress of [0.8, 0.65, 0.5]) {
    file = await ImageManipulator.manipulateAsync(
      res.assets[0].uri,
      [{ resize: { width: 512, height: 512 } }],
      {
        compress,
        format: ImageManipulator.SaveFormat.WEBP,
      },
    );
    const head = await fetch(file.uri);
    if ((await head.blob()).size <= 200 * 1024) break;
  }
  if (!file) return null;

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token || !api) throw new Error('not_ready');
  const auth = { Authorization: `Bearer ${token}` };
  const ticket = await fetch(`${api}/v1/avatars/upload`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_type: 'image/webp' }),
  });
  if (!ticket.ok) throw new Error(`upload_url_${ticket.status}`);
  const { upload_url } = (await ticket.json()) as { upload_url: string };
  const body = await (await fetch(file.uri)).blob();
  const put = await fetch(upload_url, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'image/webp' },
    body,
  });
  if (!put.ok) throw new Error(`upload_${put.status}`);
  return ((await put.json()) as { avatar_url: string }).avatar_url;
}
