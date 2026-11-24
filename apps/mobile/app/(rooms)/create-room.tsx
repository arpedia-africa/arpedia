import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { Screen, useToast } from '@arpedia/ui';
import { ROOMS_HOSTED_MAX, paceFinishLine, roomNameError } from '@arpedia/core';
import { useSession } from '../../features/01/session';
import {
  CreateRoomBody,
  CreateRoomFoot,
  CreateRoomHero,
  type CreateRoomValues,
} from '../../features/07/FormViews';
import {
  chaptersLeft,
  coverToneFor,
  createErrorOf,
  useChapterCount,
  useCreateRoom,
  useIsMinor,
  useLibraryBooks,
  useMyRooms,
  type CreateError,
} from '../../features/07/data';
import { useTrack } from '../../features/07/analytics';

const HOST_LIMIT = `You're hosting ${ROOMS_HOSTED_MAX} rooms. End one to start another.`;

const ERROR_COPY: Record<CreateError, string> = {
  host_limit: HOST_LIMIT,
  room_limit: "You're in 20 rooms. Leave one to start another.",
  room_name: 'Use 3 to 40 characters for the room name.',
  name_blocked: 'Choose a different name.',
  minor_anyone: 'Anyone rooms are for readers 18 and over.',
  other: "Couldn't create the room. Check your connection.",
};

/** s-create-room: name, book, pace, who can join. */
export default function CreateRoom() {
  const toast = useToast();
  const session = useSession();
  const net = useNetInfo();
  const offline = net.isConnected === false;
  const [values, setValues] = useState<CreateRoomValues>({
    name: '',
    book: null,
    pace: 'free',
    join: 'code',
  });
  const [error, setError] = useState<CreateError | null>(null);
  const library = useLibraryBooks();
  const create = useCreateRoom();
  const track = useTrack();
  const mine = useMyRooms();
  const minor = useIsMinor(session?.user.id).data === true;

  const books = useMemo(
    () => (library.data ?? []).map((b) => ({ id: b.id, title: b.title, tone: coverToneFor(b.id) })),
    [library.data],
  );
  const picked = (library.data ?? []).find((b) => b.id === values.book);
  const chapters = useChapterCount(picked).data;
  // Rule 7: counted from the chapters the creator hasn't finished yet.
  const left = picked && chapters ? chaptersLeft(picked, chapters) : 0;
  const paceHint = left ? paceFinishLine(values.pace, left) : null;

  const hosting = (mine.data ?? []).filter((r) => r.is_host && r.state !== 'ended').length;
  const atLimit = hosting >= ROOMS_HOSTED_MAX;
  const ready = !roomNameError(values.name) && !!values.book;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/rooms'));
  const submit = () => {
    if (!values.book || !ready) return;
    setError(null);
    create.mutate(
      { name: values.name, book: values.book, pace: values.pace, join_policy: values.join },
      {
        onSuccess: (r) => {
          track('room_created', { pace: values.pace, join_policy: values.join, book_id: values.book! });
          router.replace(`/room/${r.room_id}?share=1`);
        },
        onError: (e) => {
          const k = createErrorOf(e);
          setError(k);
          if (k === 'other') toast({ message: ERROR_COPY.other });
        },
      },
    );
  };

  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={
        <CreateRoomFoot
          enabled={ready && !atLimit}
          busy={create.isPending}
          offline={offline}
          note={atLimit ? HOST_LIMIT : error ? ERROR_COPY[error] : null}
          onCreate={submit}
        />
      }
    >
      <CreateRoomHero onClose={close} />
      <CreateRoomBody
        values={values}
        onChange={(v) => {
          setError(null);
          setValues((o) => ({ ...o, ...v }));
        }}
        books={books}
        booksLoading={library.isPending}
        booksError={library.isError && !library.data}
        onRetryBooks={() => void library.refetch()}
        paceHint={paceHint}
        minor={minor}
        disabled={create.isPending}
      />
    </Screen>
  );
}
