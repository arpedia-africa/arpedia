// s-share-club, one to one with the prototype: bold sheet head "Share to a club", the .quote card,
// a flush .option-list of the reader's groups (square avatar, name, members, radio), "Add a message"
// and "Post to <group>". Posting opens that club's chat, which sends the quote card (flow 06 rule 19).
// Reading rooms on this book are listed too ("Reading room · 8 members", as in the prototype):
// choosing one shares the highlight to the room's Annotations tab (flow 07 rule 19).
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { Avatar, Btn, EmptyState, Field, Press, Sheet, Skeleton, Text, useTheme } from '@arpedia/ui';
import { memberCount, QUOTE_MAX, type QuotePayload } from '@arpedia/core';
import type { SelectionDetail } from '@arpedia/reader';
import { toneFor, useInbox, type InboxRow } from '../06/data';
import { fetchMyRooms, roomsKey } from '../07/data';
import type { ReaderState } from './state';
import { chapterNumber } from './useReader';

// Reading rooms come from get_my_rooms (only rooms on this book), and DMs aren't clubs.
const SHAREABLE = new Set<InboxRow['kind']>(['club', 'author', 'readalong', 'official']);

/** The quote card for a passage (flow 06 rule 19), or null when its chapter isn't in the book. */
export function quoteFor(
  st: ReaderState | null | undefined,
  chapterUid: string | null,
  cfi: string,
  text: string,
): QuotePayload | null {
  const ch = st?.chapters.find((x) => x.chapter_uid === chapterUid);
  if (!st || !ch) return null;
  const no = ch.kind === 'chapter' ? chapterNumber(st, ch.chapter_uid) : null;
  return {
    book_id: st.book.id,
    // The server checks access by chapter ord (can_quote); the card shows the chapter number.
    chapter: ch.ord,
    cfi,
    text: text.replace(/\s+/g, ' ').trim().slice(0, QUOTE_MAX),
    book_title: st.book.title,
    chapter_title: no ? `Ch. ${no}` : ch.title,
  };
}

/** Post a quote card (with an optional message) by opening that club's chat, which sends it once. */
export function postQuote(groupId: string, quote: QuotePayload, message: string) {
  router.push({
    pathname: '/chat/[id]',
    params: { id: groupId, quote: JSON.stringify(quote), msg: message },
  });
}

/**
 * Club / Share on the selection bar (flow 04 rule 35): `start(sel)` opens s-share-club for it. A club
 * gets the quote card in its chat; a reading room gets the highlight through `onRoom` (flow 07 rule 19).
 */
export function useShareToClub(
  st: ReaderState | null | undefined,
  onRoom?: (roomId: string, name: string, sel: SelectionDetail, message: string) => void,
) {
  const [q, setQ] = useState<{ quote: QuotePayload; sel: SelectionDetail } | null>(null);
  const start = (sel: SelectionDetail) => {
    const quote = quoteFor(st, sel.chapter_uid, sel.cfi_range, sel.text);
    if (quote) setQ({ quote, sel });
  };
  const element = (
    <ShareClubSheet
      open={!!q}
      quote={q?.quote.text ?? ''}
      source={[q?.quote.book_title, q?.quote.chapter_title].filter(Boolean).join(' · ')}
      bookId={onRoom ? st?.book.id : undefined}
      onClose={() => setQ(null)}
      onPost={(gid, msg, room) => {
        const cur = q;
        setQ(null);
        if (!cur) return;
        if (room && onRoom) onRoom(gid, room, cur.sel, msg);
        else postQuote(gid, cur.quote, msg);
      }}
    />
  );
  return { start, element };
}

interface ShareTarget {
  id: string;
  name: string;
  avatar_url: string | null;
  sub: string;
  /** Set for a reading room: the highlight is shared to it instead of posted to a chat. */
  room: boolean;
}

const membersLabel = (n: number) => `${memberCount(n)} member${n === 1 ? '' : 's'}`;

export function ShareClubSheet({
  open,
  quote,
  source,
  bookId,
  onClose,
  onPost,
}: {
  open: boolean;
  quote: string;
  source: string;
  /** With a book, its live and scheduled reading rooms are listed after the clubs. */
  bookId?: string;
  onClose: () => void;
  /** `room` is the room's name when a reading room was chosen. */
  onPost: (groupId: string, message: string, room?: string) => void;
}) {
  const { c, s, bw } = useTheme();
  const net = useNetInfo();
  const inbox = useInbox('groups');
  const rooms = useQuery({ queryKey: roomsKey, queryFn: fetchMyRooms, enabled: open && !!bookId });
  const groups: ShareTarget[] = [
    ...(inbox.data ?? [])
      .filter((g) => SHAREABLE.has(g.kind))
      .map((g) => ({
        id: g.group_id,
        name: g.name,
        avatar_url: g.avatar_url,
        sub:
          g.kind === 'readalong'
            ? `Read-along · ${membersLabel(g.member_count)}`
            : membersLabel(g.member_count),
        room: false,
      })),
    ...(bookId ? (rooms.data ?? []) : [])
      .filter((r) => r.state !== 'ended' && r.book.id === bookId)
      .map((r) => ({
        id: r.room_id,
        name: r.name,
        avatar_url: null,
        sub: `Reading room · ${membersLabel(r.member_count)}`,
        room: true,
      })),
  ];
  const [picked, setPicked] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setMessage('');
  }, [open]);
  const chosen = groups.find((g) => g.id === picked) ?? groups[0];

  return (
    <Sheet open={open} onClose={onClose} bold title="Share to a club">
      <View
        style={{
          backgroundColor: c.orgTint2,
          borderRadius: s(12),
          paddingVertical: s(10),
          paddingHorizontal: s(12),
        }}
      >
        <Text family="reading" italic size={14.5} color="ink2" style={{ lineHeight: s(14.5) * 1.5 }}>
          {`“${quote}”`}
        </Text>
        <Text size={11.5} color="ink3" oneLine style={{ marginTop: s(4) }}>
          {source}
        </Text>
      </View>
      {inbox.isPending ? (
        <View style={{ gap: s(10) }}>
          {[0, 1].map((i) => (
            <View
              key={i}
              style={{ flexDirection: 'row', alignItems: 'center', gap: s(12), minHeight: s(56) }}
            >
              <Skeleton width={s(36)} height={s(36)} radius={s(14)} />
              <Skeleton width={`${60 - i * 15}%`} height={s(14)} />
            </View>
          ))}
        </View>
      ) : inbox.isError && !inbox.data ? (
        <EmptyState
          title="Couldn't load your clubs"
          body={
            net.isConnected === false
              ? "You're offline. Connect and try again."
              : 'Check your connection and try again.'
          }
          action={{ label: 'Try again', onPress: () => void inbox.refetch() }}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          title="You're not in a club yet"
          body="Join a club to share highlights with other readers."
          action={{
            label: 'Discover communities',
            onPress: () => {
              onClose();
              router.push('/discover');
            },
          }}
        />
      ) : (
        <>
          {/* .pb .option-list--flush: margin 0 -18px, rows split by a 1px line */}
          <View accessibilityRole="radiogroup" style={{ marginHorizontal: -s(18) }}>
            {groups.map((g, i) => {
              const on = g.id === chosen?.id;
              const sub = g.sub;
              return (
                <Press
                  key={g.id}
                  onPress={() => setPicked(g.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${g.name}, ${sub}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: s(12),
                    paddingVertical: s(14),
                    paddingHorizontal: s(16),
                    minHeight: s(56),
                    backgroundColor: on ? c.orgTint2 : c.white,
                    boxShadow: on ? `inset 0 0 0 ${s(2)}px ${c.org}` : undefined,
                    ...(i && !on ? { borderTopWidth: bw(1), borderTopColor: c.line } : null),
                  }}
                >
                  <Avatar name={g.name} uri={g.avatar_url ?? undefined} tone={toneFor(g.id)} square />
                  <View style={{ flex: 1, minWidth: 0, gap: s(2) }}>
                    <Text size={15.5} weight={700} ellipsis>
                      {g.name}
                    </Text>
                    <Text size={13} color="ink2" oneLine>
                      {sub}
                    </Text>
                  </View>
                  {/* .radio: 22px ring 2px; selected = 7px main-colour ring */}
                  <View
                    style={{
                      width: s(22),
                      height: s(22),
                      borderRadius: 999,
                      borderWidth: on ? s(7) : s(2),
                      borderColor: on ? c.org : c.control,
                    }}
                  />
                </Press>
              );
            })}
          </View>
          <Field label="Add a message" value={message} onChangeText={setMessage} maxLength={2000} />
          {chosen ? (
            <Btn
              label={chosen.room ? `Share with ${chosen.name}` : `Post to ${chosen.name}`}
              block
              onPress={() => onPost(chosen.id, message.trim(), chosen.room ? chosen.name : undefined)}
            />
          ) : null}
        </>
      )}
    </Sheet>
  );
}
