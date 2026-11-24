// s-share-club, one to one with the prototype: bold sheet head "Share to a club", the .quote card,
// a flush .option-list of the reader's groups (square avatar, name, members, radio), "Add a message"
// and "Post to <group>". Posting opens that club's chat, which sends the quote card (flow 06 rule 19).
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { Avatar, Btn, EmptyState, Field, Press, Sheet, Skeleton, Text, useTheme } from '@arpedia/ui';
import { memberCount, QUOTE_MAX, type QuotePayload } from '@arpedia/core';
import type { SelectionDetail } from '@arpedia/reader';
import { toneFor, useInbox, type InboxRow } from '../06/data';
import type { ReaderState } from './state';
import { chapterNumber } from './useReader';

// Reading rooms post through the room screen (spoiler stamps, flow 07) and DMs aren't clubs.
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

/** Club / Share on the selection bar (flow 04 rule 35): `start(sel)` opens s-share-club for it. */
export function useShareToClub(st: ReaderState | null | undefined) {
  const [q, setQ] = useState<QuotePayload | null>(null);
  const start = (sel: SelectionDetail) => {
    const quote = quoteFor(st, sel.chapter_uid, sel.cfi_range, sel.text);
    if (quote) setQ(quote);
  };
  const element = (
    <ShareClubSheet
      open={!!q}
      quote={q?.text ?? ''}
      source={[q?.book_title, q?.chapter_title].filter(Boolean).join(' · ')}
      onClose={() => setQ(null)}
      onPost={(gid, msg) => {
        const quote = q;
        setQ(null);
        if (quote) postQuote(gid, quote, msg);
      }}
    />
  );
  return { start, element };
}

export function ShareClubSheet({
  open,
  quote,
  source,
  onClose,
  onPost,
}: {
  open: boolean;
  quote: string;
  source: string;
  onClose: () => void;
  onPost: (groupId: string, message: string) => void;
}) {
  const { c, s, bw } = useTheme();
  const net = useNetInfo();
  const inbox = useInbox('groups');
  const groups = (inbox.data ?? []).filter((g) => SHAREABLE.has(g.kind));
  const [picked, setPicked] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setMessage('');
  }, [open]);
  const chosen = groups.find((g) => g.group_id === picked) ?? groups[0];

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
              const on = g.group_id === chosen?.group_id;
              const members = `${memberCount(g.member_count)} member${g.member_count === 1 ? '' : 's'}`;
              const sub = g.kind === 'readalong' ? `Read-along · ${members}` : members;
              return (
                <Press
                  key={g.group_id}
                  onPress={() => setPicked(g.group_id)}
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
                  <Avatar name={g.name} uri={g.avatar_url ?? undefined} tone={toneFor(g.group_id)} square />
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
              label={`Post to ${chosen.name}`}
              block
              onPress={() => onPost(chosen.group_id, message.trim())}
            />
          ) : null}
        </>
      )}
    </Sheet>
  );
}
