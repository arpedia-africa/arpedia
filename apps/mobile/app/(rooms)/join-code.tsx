import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { Screen, Sheet, useToast } from '@arpedia/ui';
import { ROOM_CODE_LENGTH, joinErrorMessage, normaliseRoomCode } from '@arpedia/core';
import { ConsentBody, JoinCodeBody, JoinCodeFoot, JoinCodeHero } from '../../features/07/FormViews';
import { useJoinRoom, type JoinResult } from '../../features/07/data';
import { useTrack } from '../../features/07/analytics';

const NETWORK_ERROR = "Couldn't join. Check your connection and try again.";

/** s-join-code: eight boxes, paste, the consent line once per room. */
export default function JoinCode() {
  const toast = useToast();
  const net = useNetInfo();
  const offline = net.isConnected === false;
  // arpedia.africa/r/GRACE24A opens here with the code filled in.
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(() => normaliseRoomCode(params.code ?? ''));
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState<JoinResult | null>(null);
  const join = useJoinRoom();
  const track = useTrack();

  const close = () => (router.canGoBack() ? router.back() : router.replace('/rooms'));
  const change = (c: string) => {
    setCode(c);
    setError(null);
  };
  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    const c = normaliseRoomCode(text);
    if (!c) return toast({ message: 'Copy the invite code first.' });
    change(c);
  };

  const handle = (r: JoinResult) => {
    if (r.status === 'confirm') return setConsent(r);
    const ok = r.status === 'joined' || r.status === 'member';
    track('room_join_attempted', ok ? { success: true } : { success: false, error: r.status });
    if (ok) {
      if (r.status === 'joined') track('room_joined', { via: params.code ? 'link' : 'code' });
      setConsent(null);
      return router.replace(`/room/${r.room_id}`);
    }
    setConsent(null);
    setError(joinErrorMessage(r.status, r.retry_at) ?? NETWORK_ERROR);
  };
  const submit = (confirm: boolean) =>
    join.mutate(
      { code, confirm },
      {
        onSuccess: handle,
        onError: () => {
          track('room_join_attempted', { success: false, error: 'network' });
          setConsent(null);
          setError(NETWORK_ERROR);
        },
      },
    );

  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={
        <JoinCodeFoot
          filled={code.length}
          busy={join.isPending && !consent}
          offline={offline}
          onJoin={() => code.length === ROOM_CODE_LENGTH && submit(false)}
        />
      }
    >
      <JoinCodeHero onClose={close} />
      <JoinCodeBody
        code={code}
        onChange={change}
        onPaste={() => void paste()}
        error={error}
        focused={focused}
        onFocusChange={setFocused}
        busy={join.isPending && !consent}
        autoFocus
      />
      <Sheet open={!!consent} onClose={() => setConsent(null)} title={consent?.name} locked={join.isPending}>
        {consent ? (
          <ConsentBody
            book={consent.book_title ?? 'this book'}
            blockedWarning={consent.blocked_member}
            busy={join.isPending}
            onJoin={() => submit(true)}
            onCancel={() => setConsent(null)}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}
