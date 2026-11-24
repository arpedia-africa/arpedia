import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '@arpedia/ui';
import { useSession } from '../../../../features/01/session';
import { useTrack } from '../../../../features/11/analytics';
import { fileSize, STUDIO } from '../../../../features/11/application';
import { startUpload } from '../../../../features/11/convert';
import { useStudioBooks } from '../../../../features/11/studio';
import {
  coverLine,
  pickCover,
  pickManuscript,
  SubmitError,
  submitStep,
  type PickedFile,
} from '../../../../features/11/submit';
import {
  StepFoot,
  SubmitUploadView,
  type SubmitErrors,
  type SubmitValues,
} from '../../../../features/11/SubmitViews';

/**
 * s-studio-submit (rule 17): manuscript, cover, title, subtitle, up to 3 genres, description.
 * Continue needs file, cover, title, a genre and a description. `?book=` uploads a new file for an
 * existing book (update, or Upload new file after Changes requested).
 */
export default function SubmitUpload() {
  const track = useTrack();
  const qc = useQueryClient();
  const net = useNetInfo();
  const uid = useSession()?.user.id;
  const { book, replace } = useLocalSearchParams<{ book?: string; replace?: string }>();
  const [values, setValues] = useState<SubmitValues>({
    source: 'docx',
    title: '',
    subtitle: '',
    genres: [],
    description: '',
  });
  const [file, setFile] = useState<PickedFile | null>(null);
  const [cover, setCover] = useState<(PickedFile & { width?: number; height?: number }) | null>(null);
  const [errors, setErrors] = useState<SubmitErrors>({});
  const [busy, setBusy] = useState(false);
  const books = useStudioBooks(uid);
  const newBookOk = useRef(false);
  // "Update it" on the duplicate-title prompt: carry on as an upload for that book.
  const [updateNext, setUpdateNext] = useState(false);
  useEffect(() => {
    if (!updateNext || !book) return;
    setUpdateNext(false);
    void next();
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace(STUDIO));

  const choose = async (what: 'file' | 'cover') => {
    setErrors((e) => ({ ...e, [what]: undefined }));
    try {
      if (what === 'file') {
        const f = await pickManuscript(values.source);
        if (f) {
          setFile(f);
          if (!values.title) setValues((v) => ({ ...v, title: titleFromName(f.name) }));
        }
      } else {
        const c = await pickCover();
        if (c) setCover(c);
      }
    } catch (e) {
      setErrors((x) => ({
        ...x,
        [what]: e instanceof SubmitError ? e.message : 'Couldn’t open that file. Try again.',
      }));
    }
  };

  const next = async () => {
    const err: SubmitErrors = {};
    if (!file) err.file = 'Choose your manuscript.';
    if (!cover) err.cover = 'Add a cover image.';
    if (!values.title.trim()) err.title = 'Add the title readers will see.';
    if (!values.genres.length) err.genres = 'Pick at least one genre.';
    if (values.description.trim().length < 20) err.description = 'Write two or three sentences for readers.';
    setErrors(err);
    if (Object.keys(err).length || !file || !cover) return;
    // Edge case: the same author sending a title they already have is asked to update that book.
    const same = book ? null : books.data?.find((b) => sameTitle(b.title, values.title));
    if (same && !newBookOk.current) {
      Alert.alert('You already have this book', `Update “${same.title}” instead?`, [
        {
          text: 'It’s a new book',
          onPress: () => {
            newBookOk.current = true;
            void next();
          },
        },
        {
          text: 'Update it',
          onPress: () => {
            router.setParams({ book: same.book_id });
            setUpdateNext(true);
          },
        },
      ]);
      return;
    }

    setBusy(true);
    track('book_submit_started', { source_type: values.source });
    track('book_upload_started', { source_type: values.source, bytes: file.size });
    try {
      const rev = await startUpload(values, file, cover, book, replace === '1');
      void qc.invalidateQueries({ queryKey: ['studio-books', uid] });
      void qc.invalidateQueries({ queryKey: ['studio-home', uid] });
      router.replace(submitStep('processing', rev));
    } catch (e) {
      setErrors({
        form:
          e instanceof SubmitError ? e.message : 'Upload didn’t finish. Check your connection and try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const offline = net.isConnected === false;
  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={
        <StepFoot
          label={offline ? 'Connect to upload' : busy ? 'Uploading…' : 'Continue'}
          onPress={() => void next()}
          loading={busy}
          disabled={offline}
        />
      }
    >
      <SubmitUploadView
        values={values}
        file={file ? { name: file.name, line: `${fileSize(file.size)} · ready to upload` } : null}
        cover={cover ? { name: cover.name, line: coverLine(cover, fileSize(cover.size)) } : null}
        errors={errors}
        onChange={(v) => {
          setValues((cur) => ({ ...cur, ...v }));
          // a manuscript of the other type no longer fits the choice
          if (v.source && file && !file.name.toLowerCase().endsWith(`.${v.source}`)) setFile(null);
        }}
        onPickFile={() => void choose('file')}
        onRemoveFile={() => setFile(null)}
        onPickCover={() => void choose('cover')}
        onRemoveCover={() => setCover(null)}
        onBack={back}
      />
    </Screen>
  );
}

/** Titles match ignoring case, spacing and punctuation ("Market Day" = "market  day!"). */
function sameTitle(a: string, b: string) {
  const norm = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return norm(a) !== '' && norm(a) === norm(b);
}

/** "market-day-in-onitsha-final.docx" → "Market Day In Onitsha Final" as a starting title. */
function titleFromName(name: string) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b(final|draft|v\d+)\b/gi, '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}
