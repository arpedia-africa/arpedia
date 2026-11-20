import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Btn, Callout, KeyValue, Sheet, Skeleton, Text } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { rpcError } from '../03/UnlockSheet';
import { useTrack } from './analytics';
import { authorKey, firstName, threadKey, useAuthorThread } from './data';

// s-dm-confirm (rule 22): the price, privacy and the reader's balance, once, before the first message.

const n = (v: number) => v.toLocaleString('en-NG');

export function DmConfirmSheet({
  authorId,
  name,
  open,
  onClose,
  onStarted,
}: {
  authorId: string;
  name: string;
  open: boolean;
  onClose: () => void;
  onStarted: () => void;
}) {
  const qc = useQueryClient();
  const track = useTrack();
  const thread = useAuthorThread(authorId, open);
  const t = thread.data;
  const [error, setError] = useState<string | null>(null);
  const first = firstName(name);

  useEffect(() => {
    if (!open) return;
    setError(null);
    void thread.refetch();
    track('dm_cost_notice_viewed', { author_id: authorId });
    // Refetch and log each time the sheet opens.
  }, [open]);

  const start = useMutation({
    mutationFn: async () => {
      const { data, error: e } = await supabase.rpc('ack_dm_cost', { p_author: authorId });
      if (e) throw e;
      return data as unknown as { group_id: string; balance: number };
    },
    onSuccess: () => {
      track('dm_started', { author_id: authorId });
      void qc.invalidateQueries({ queryKey: authorKey(authorId) });
      void qc.invalidateQueries({ queryKey: threadKey(authorId) });
      onStarted();
    },
    onError: (e) => {
      const { code } = rpcError(e);
      setError(
        code === 'network'
          ? 'You’re offline. Connect and try again.'
          : code === 'blocked'
            ? 'You blocked this author. Unblock them to send a message.'
            : code === 'author_unavailable'
              ? `${first} isn’t taking messages right now.`
              : 'Something went wrong. Try again.',
      );
    },
  });

  return (
    <Sheet open={open} onClose={onClose} title={`Message ${first}`} locked={start.isPending}>
      <Text variant="sm" color="ink2">
        {`Messages to this author cost ${t ? n(t.cost_credits) : '…'} credits each. They’re private: only ${first} sees them. Their replies are free.`}
      </Text>
      {t ? (
        <KeyValue
          rows={[
            { k: 'Your balance', v: `${n(t.balance)} credits` },
            { k: 'Per message', v: `${n(t.cost_credits)} credits` },
          ]}
        />
      ) : thread.isError ? (
        <Callout tone="quiet">Couldn’t load your balance. Close and try again.</Callout>
      ) : (
        <Skeleton height={86} radius={14} />
      )}
      {error ? <Callout tone="err">{error}</Callout> : null}
      <Btn
        label="Start private chat"
        block
        loading={start.isPending}
        disabled={!t}
        onPress={() => start.mutate()}
      />
    </Sheet>
  );
}
