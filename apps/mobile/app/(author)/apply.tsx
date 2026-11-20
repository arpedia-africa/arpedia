import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { ageOn, normalisePhone, parseDob, validEmail, validName } from '@arpedia/core';
import { EmptyState, Screen, Skeleton, useTheme } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { OnbSheet } from '../../features/01/parts';
import { isNetworkError, useSession } from '../../features/01/session';
import { useTrack } from '../../features/11/analytics';
import {
  Apply1View,
  Apply2View,
  Apply3View,
  Apply4Foot,
  Apply4View,
  ApplyFoot,
  type Step1Errors,
  type Step1Values,
} from '../../features/11/ApplyViews';
import {
  SampleError,
  STUDIO,
  applicationKey,
  fileSize,
  pickAndUploadSample,
  rpcCode,
  useApplication,
  useDraftSaver,
  type Application,
  type DraftPatch,
  type SaveState,
} from '../../features/11/application';
import { StepHero } from '../../features/11/parts';

type Step = 1 | 2 | 3 | 4;
const AUTHOR_MIN_AGE = 18;

const isoToDob = (iso: string | null) => (iso ? iso.split('-').reverse().join(' / ') : '');
const localPhone = (e164: string | null) => (e164?.startsWith('+234') ? `0${e164.slice(4)}` : (e164 ?? ''));
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const SAVED: Record<SaveState, string> = {
  idle: 'Draft saves as you type',
  saving: 'Saving draft…',
  saved: 'Draft saved',
  offline: 'Saved on this phone. It syncs when you’re back online.',
  error: 'Draft didn’t save. Tap Save draft to try again.',
};

const MISSING: Record<string, string> = {
  legal_name: 'your full name',
  email: 'your email',
  date_of_birth: 'your date of birth',
  state: 'your state',
  categories: 'what you write',
  bio: 'a short bio',
  sample: 'a writing sample',
  terms: 'the author terms',
};

export default function Apply() {
  const { s } = useTheme();
  const track = useTrack();
  const qc = useQueryClient();
  const uid = useSession()?.user.id;
  const app = useApplication(uid);
  const saver = useDraftSaver(uid);
  const net = useNetInfo();
  const offline = net.isConnected === false;

  const [step, setStep] = useState<Step>(1);
  const [v1, setV1] = useState<Step1Values>({
    legal_name: '',
    email: '',
    dob: '',
    state: '',
    phone: '',
    pen_name: '',
    social_handle: '',
  });
  const [e1, setE1] = useState<Step1Errors>({});
  const [cats, setCats] = useState<string[]>([]);
  const [bio, setBio] = useState('');
  const [exp, setExp] = useState('');
  const [e2, setE2] = useState<{ categories?: string; bio?: string }>({});
  const [text, setText] = useState('');
  const [file, setFile] = useState<{ name: string; meta: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [e3, setE3] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const loaded = useRef(false);

  // Fill the form once from the draft (rule 3: name and email come from the account), and reopen
  // at the step left off, or the step the editor asked about (rule 9).
  useEffect(() => {
    const a = app.data;
    if (!a || loaded.current) return;
    loaded.current = true;
    setV1({
      legal_name: a.legal_name,
      email: a.email,
      dob: isoToDob(a.date_of_birth),
      state: a.state ?? '',
      phone: localPhone(a.phone),
      pen_name: a.pen_name ?? '',
      social_handle: a.social_handle ?? '',
    });
    setCats(a.categories);
    setBio(a.bio);
    setExp(a.experience);
    setText(a.sample_text ?? '');
    setFile(sampleCard(a));
    setStep((a.status === 'needs_info' && a.info_step ? a.info_step : a.step_reached) as Step);
  }, [app.data]);

  // Already an author, or locked out after a rejection: back to where that is explained.
  useEffect(() => {
    const code = app.error ? rpcCode(app.error).code : null;
    if (code === 'already_author') router.replace(STUDIO);
  }, [app.error]);

  const question = app.data?.status === 'needs_info' ? app.data.info_request : null;
  const save = (patch: DraftPatch) => saver.queue(patch);

  const check1: Record<keyof Step1Values, () => string | undefined> = {
    legal_name: () => (validName(v1.legal_name) ? undefined : 'Enter your full name.'),
    email: () => (validEmail(v1.email) ? undefined : 'Enter a full email address.'),
    dob: () => {
      const iso = parseDob(v1.dob);
      if (!iso) return 'Use DD / MM / YYYY.';
      return ageOn(iso, todayIso()) >= AUTHOR_MIN_AGE ? undefined : 'Authors need to be 18 or older.';
    },
    state: () => (v1.state.trim() ? undefined : 'Enter your state.'),
    phone: () =>
      !v1.phone.trim() || normalisePhone(v1.phone, '234') ? undefined : 'Check the phone number.',
    pen_name: () => undefined,
    social_handle: () => undefined,
  };

  // Each edit goes to the draft; only values the server accepts are sent (a half-typed date or
  // phone stays on screen until it is valid).
  const change1 = (v: Partial<Step1Values>) => {
    setV1((cur) => ({ ...cur, ...v }));
    const k = Object.keys(v)[0] as keyof Step1Values;
    setE1((cur) => ({ ...cur, [k]: undefined }));
    const val = v[k] ?? '';
    if (k === 'dob') {
      const iso = parseDob(val);
      if (iso || !val.trim()) save({ date_of_birth: iso });
    } else if (k === 'phone') {
      const p = normalisePhone(val, '234');
      if (p || !val.trim()) save({ phone: p });
    } else {
      save({ [k]: val } as DraftPatch);
    }
  };

  const go = (to: Step) => {
    if (to > step) {
      track('application_step_completed', { step });
      save({ step: to });
    }
    setStep(to);
  };

  const cont = () => {
    if (step === 1) {
      const errs: Step1Errors = {};
      (Object.keys(check1) as (keyof Step1Values)[]).forEach((k) => {
        const e = check1[k]();
        if (e) errs[k] = e;
      });
      setE1(errs);
      if (Object.keys(errs).length === 0) go(2);
    } else if (step === 2) {
      const errs = {
        categories: cats.length ? undefined : 'Pick at least one.',
        bio: bio.trim() ? undefined : 'Write a short bio.',
      };
      setE2(errs);
      if (!errs.categories && !errs.bio) go(3);
    } else if (step === 3) {
      if (!file && !text.trim()) setE3('Upload a file or paste some of your writing.');
      else go(4);
    }
  };

  const saveNow = async () => {
    const ok = await saver.flush();
    if (ok) track('application_draft_saved');
  };
  const cancel = () => {
    // Cancel keeps the draft (rule 4).
    void saver.flush();
    if (router.canGoBack()) router.back();
    else router.replace('/become-author');
  };
  const back = () => (step > 1 ? setStep((step - 1) as Step) : cancel());

  const pick = async () => {
    setE3(null);
    setUploading(true);
    try {
      const f = await pickAndUploadSample();
      if (f) {
        setFile({
          name: f.name,
          meta: [fileSize(f.size), f.pages ? pages(f.pages) : null].filter(Boolean).join(' · '),
        });
        void qc.invalidateQueries({ queryKey: applicationKey(uid) });
      }
    } catch (e) {
      setE3(
        e instanceof SampleError
          ? e.message
          : isNetworkError(e)
            ? 'No connection. Your file wasn’t uploaded. Try again.'
            : 'Upload didn’t work. Try again.',
      );
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    setSendError(null);
    setSending(true);
    try {
      const ok = await saver.flush();
      if (!ok) throw new Error('save');
      const { data, error } = await supabase.rpc('submit_application', { p_accept_terms: agree });
      if (error) throw error;
      qc.setQueryData(applicationKey(uid), data);
      void qc.invalidateQueries({ queryKey: applicationKey(uid) });
      track('application_sent', { resend: !!question });
      router.replace('/apply-sent');
    } catch (e) {
      const { code, detail } = rpcCode(e);
      if (code === 'incomplete' && Array.isArray(detail.missing)) {
        const list = (detail.missing as string[]).map((m) => MISSING[m] ?? m);
        setSendError(`Still needed: ${list.join(', ')}.`);
      } else if (isNetworkError(e) || code === 'save') {
        setSendError('No connection. Your application wasn’t sent. Try again.');
      } else {
        setSendError('Something went wrong. Try again.');
      }
    } finally {
      setSending(false);
    }
  };

  const rows = useMemo(
    () => [
      { k: 'Name', v: v1.legal_name.trim() || '—' },
      { k: 'Pen name', v: v1.pen_name.trim() || 'None' },
      { k: 'Writes', v: cats.join(', ') || '—' },
      { k: 'Sample', v: file?.name ?? (text.trim() ? 'Pasted text' : '—') },
    ],
    [v1.legal_name, v1.pen_name, cats, file, text],
  );
  const ready1 = !check1.legal_name() && !check1.email() && !check1.dob() && !check1.state();
  const canSend = ready1 && cats.length > 0 && !!bio.trim() && (!!file || !!text.trim()) && agree;
  const saved = SAVED[saver.state];

  if (!app.data) {
    const code = app.error ? rpcCode(app.error).code : null;
    return (
      <Screen top="org" contentStyle={{ flexGrow: 1 }}>
        <StepHero
          step={1}
          title="Your author profile"
          sub="Tell us how readers should know you."
          onBack={cancel}
        />
        <OnbSheet>
          {app.isError && code !== 'already_author' ? (
            <View style={{ paddingTop: s(24) }}>
              <EmptyState
                title={
                  code === 'reapply_locked'
                    ? 'Not yet'
                    : isNetworkError(app.error)
                      ? 'You’re offline'
                      : 'Couldn’t open your application'
                }
                body={
                  code === 'reapply_locked'
                    ? 'You can apply again after the date in your last decision.'
                    : isNetworkError(app.error)
                      ? 'Connect to start your application. Your answers save as you type once you’re online.'
                      : 'Something went wrong on our side. Try again.'
                }
                action={
                  code === 'reapply_locked'
                    ? { label: 'Back', onPress: cancel }
                    : { label: 'Try again', onPress: () => void app.refetch() }
                }
              />
            </View>
          ) : (
            <View
              style={{ paddingTop: s(22), paddingHorizontal: s(20), gap: s(16) }}
              accessibilityLabel="Loading"
            >
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={{ gap: s(6) }}>
                  <Skeleton width="40%" height={s(13)} />
                  <Skeleton height={s(50)} radius={s(12)} />
                </View>
              ))}
            </View>
          )}
        </OnbSheet>
      </Screen>
    );
  }

  const foot =
    step === 4 ? (
      <Apply4Foot
        canSend={canSend}
        sending={sending}
        offline={offline}
        error={sendError}
        onSend={() => void send()}
        onEdit={() => setStep(1)}
      />
    ) : (
      <ApplyFoot
        onContinue={cont}
        onSave={() => void saveNow()}
        onCancel={cancel}
        saving={saver.state === 'saving'}
      />
    );

  return (
    <Screen top="org" contentStyle={{ flexGrow: 1 }} footer={foot}>
      {step === 1 ? (
        <Apply1View
          values={v1}
          errors={e1}
          saved={saved}
          question={question}
          onChange={change1}
          onBlur={(f) => setE1((cur) => ({ ...cur, [f]: v1[f].trim() ? check1[f]() : undefined }))}
          onBack={back}
        />
      ) : step === 2 ? (
        <Apply2View
          categories={cats}
          bio={bio}
          experience={exp}
          errors={e2}
          saved={saved}
          question={question}
          onToggle={(c) => {
            const next = cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c];
            setCats(next);
            setE2((e) => ({ ...e, categories: undefined }));
            save({ categories: next });
          }}
          onBio={(t) => {
            setBio(t);
            setE2((e) => ({ ...e, bio: undefined }));
            save({ bio: t });
          }}
          onExperience={(t) => {
            setExp(t);
            save({ experience: t });
          }}
          onBack={back}
        />
      ) : step === 3 ? (
        <Apply3View
          file={file}
          uploading={uploading}
          sampleText={text}
          error={e3}
          saved={saved}
          question={question}
          onPick={() => void pick()}
          onRemove={() => {
            setFile(null);
            save({ sample_file_key: null });
          }}
          onText={(t) => {
            setText(t);
            setE3(null);
            save({ sample_text: t });
          }}
          onBack={back}
        />
      ) : (
        <Apply4View
          rows={rows}
          agree={agree}
          missing={ready1 ? null : 'Some details in step 1 are missing. Tap Edit details to finish them.'}
          onAgree={setAgree}
          onBack={back}
        />
      )}
    </Screen>
  );
}

const pages = (n: number) => `${n} page${n === 1 ? '' : 's'}`;

function sampleCard(a: Application) {
  if (!a.sample_file_key || !a.sample_file_name) return null;
  return { name: a.sample_file_name, meta: a.sample_pages ? pages(a.sample_pages) : 'Uploaded' };
}
