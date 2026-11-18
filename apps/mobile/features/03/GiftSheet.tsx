import { useEffect, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TIP_DEFAULT, TIP_PRESETS, tipNaira } from '@arpedia/core';
import { Sheet, useToast } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { useTrack } from './analytics';
import { bookKey, type BookPageData } from './book';
import { avatarTone } from './BookViews';
import { GiftBody, TipBody, type GiftPerson } from './GiftViews';
import { rpcError } from './UnlockSheet';

// s-gift and s-tip (rules 32–38). Opened only when the balance covers the spend; otherwise the
// book page opens the not-enough-credits or no-plan body (rule 14). Money moves only in the RPCs.

const n = (v: number) => v.toLocaleString('en-NG');

/** A spend's error, in words. `null` when the caller handles it (price_changed refreshes). */
function spendMessage(code: string): string {
  switch (code) {
    case 'network':
      return 'No connection. Nothing was charged. Try again.';
    case 'insufficient_credits':
      return 'You don’t have enough credits for this any more. Nothing was charged.';
    case 'already_has_it':
      return 'They already have this book. Nothing was charged.';
    case 'rate_limited':
      return 'That’s a lot of taps. Wait a minute, then try again.';
    case 'message_too_long':
      return 'Keep the message to 140 characters.';
    default:
      return 'Something went wrong. Nothing was charged. Try again.';
  }
}

export function GiftSheet({
  book: d,
  open,
  onClose,
  onShort,
}: {
  book: BookPageData;
  open: boolean;
  onClose: () => void;
  onShort: (need: number) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const track = useTrack();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(null);
    setMessage('');
    setError(null);
    setKey(Crypto.randomUUID());
  }, [open]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const people = useQuery({
    queryKey: ['gift-people', d.book.id, debounced],
    enabled: open,
    queryFn: async () => {
      const { data, error: e } = await supabase.rpc('get_gift_people', {
        p_book: d.book.id,
        p_query: debounced || undefined,
      });
      if (e) throw e;
      return (data as { id: string; name: string | null; why: string; has_it: boolean }[]).map(
        (p): GiftPerson => ({
          id: p.id,
          name: p.name ?? 'Reader',
          why: p.why,
          hasIt: p.has_it,
          tone: avatarTone(p.id),
        }),
      );
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      const { data, error: e } = await supabase.rpc('gift_book', {
        p_book: d.book.id,
        p_recipient: selected!,
        p_message: message,
        p_expected_price: d.price,
        p_key: key,
      });
      if (e) throw e;
      return data as { balance: number };
    },
    onSuccess: (r) => {
      track('gift_sent', { book_id: d.book.id, price: d.price });
      const name = people.data?.find((p) => p.id === selected)?.name.split(' ')[0] ?? 'Your friend';
      onClose();
      toast({ message: `Gift sent to ${name} · ${n(r.balance)} credits left` });
      void qc.invalidateQueries({ queryKey: bookKey(d.book.id) });
    },
    onError: (e) => {
      const { code, detail } = rpcError(e);
      if (code !== 'network') setKey(Crypto.randomUUID());
      if (code === 'price_changed') {
        setError(`The price changed to ${n(detail.price ?? d.price)} credits. Check it, then send again.`);
        void qc.invalidateQueries({ queryKey: bookKey(d.book.id) });
      } else if (code === 'insufficient_credits') {
        // Balance moved since the sheet opened: show not-enough-credits / no-plan (rule 14).
        void qc.invalidateQueries({ queryKey: bookKey(d.book.id) });
        onShort(d.price);
      } else {
        setError(spendMessage(code));
        if (code === 'already_has_it') void people.refetch();
      }
    },
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      locked={send.isPending}
      bold
      title={`Gift ${d.book.title}`}
      sub={`${n(d.price)} credits from your balance`}
    >
      <GiftBody
        query={query}
        onQuery={setQuery}
        people={people.data ?? []}
        loading={people.isPending}
        selected={selected}
        onSelect={setSelected}
        message={message}
        onMessage={setMessage}
        price={d.price}
        onSend={() => send.mutate()}
        busy={send.isPending}
        error={error}
      />
    </Sheet>
  );
}

export function TipSheet({
  book: d,
  open,
  onClose,
  onShort,
}: {
  book: BookPageData;
  open: boolean;
  onClose: () => void;
  /** The balance doesn't cover the picked amount: show not-enough-credits or no-plan (rule 14). */
  onShort: (need: number) => void;
}) {
  const toast = useToast();
  const track = useTrack();
  const [amount, setAmount] = useState<number>(TIP_DEFAULT);
  const [note, setNote] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setAmount(TIP_DEFAULT);
    setNote('');
    setError(null);
    setKey(Crypto.randomUUID());
  }, [open]);

  const send = useMutation({
    mutationFn: async () => {
      const { data, error: e } = await supabase.rpc('tip_author', {
        p_book: d.book.id,
        p_credits: amount,
        p_note: note,
        p_key: key,
      });
      if (e) throw e;
      return data as { balance: number };
    },
    onSuccess: (r) => {
      track('tip_sent', { book_id: d.book.id, credits: amount });
      onClose();
      toast({ message: `Tip sent · ${n(r.balance)} credits left` });
      void qc.invalidateQueries({ queryKey: bookKey(d.book.id) });
    },
    onError: (e) => {
      const { code } = rpcError(e);
      if (code !== 'network') setKey(Crypto.randomUUID());
      setError(code === 'own_book' ? 'You can’t tip yourself.' : spendMessage(code));
    },
  });

  const first = (d.book.author.name ?? 'the author').split(' ')[0];
  // A new amount is a new tap: it gets its own key.
  const pick = (v: number) => {
    setAmount(v);
    setKey(Crypto.randomUUID());
    setError(null);
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      locked={send.isPending}
      bold
      title={`Tip ${first}`}
      sub={`₦${n(tipNaira(amount))} of ${n(amount)} credits reaches them with their monthly earnings`}
    >
      <TipBody
        presets={TIP_PRESETS}
        amount={amount}
        onAmount={pick}
        note={note}
        onNote={setNote}
        onSend={() => (amount > d.balance ? onShort(amount) : send.mutate())}
        busy={send.isPending}
        error={error}
      />
    </Sheet>
  );
}
