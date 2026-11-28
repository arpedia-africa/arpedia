// s-library-filter, s-pay-rest-lib and the cover ⋯ menu. Money moves only in unlock_book (flow 03):
// Pay the rest shows the server's `remaining_credits`, never a number worked out on the phone.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LibraryItem, LibrarySort } from '@arpedia/core';
import { Btn, Callout, KeyValue, Press, Segmented, Sheet, Text, useTheme } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { useBookPage } from '../03/book';
import { rpcError, UnlockSheet } from '../03/UnlockSheet';
import type { UnlockMode } from '../03/UnlockViews';
import { useTrack } from './analytics';
import type { ShelfName } from './LibraryViews';
import { useAskPush } from '../15/push';

const n = (v: number) => v.toLocaleString('en-NG');

/* ─── Filter library ─────────────────────────────────────────────────────── */
const FILTER_SHELVES: { k: ShelfName; label: string }[] = [
  { k: 'reading', label: 'Reading' },
  { k: 'saved', label: 'Saved' },
  { k: 'finished', label: 'Finished' },
  { k: 'offline', label: 'Offline downloads' },
];
export const SORTS: { value: LibrarySort; label: string }[] = [
  { value: 'last_opened', label: 'Last opened' },
  { value: 'title', label: 'Title' },
  { value: 'progress', label: 'Progress' },
];

/** `.option.option--compact`: radio, shelf name, count. */
function ShelfOption({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count: number | null;
  selected: boolean;
  onPress: () => void;
}) {
  const { c, s, bw } = useTheme();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={count == null ? label : `${label}, ${count}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        paddingVertical: s(12),
        paddingHorizontal: s(14),
        minHeight: s(48),
        borderRadius: s(14),
        borderWidth: bw(1),
        borderColor: selected ? 'transparent' : c.line,
        backgroundColor: selected ? c.orgTint2 : c.white,
      }}
    >
      {selected ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: s(14) - 1,
            borderWidth: s(2),
            borderColor: c.org,
          }}
        />
      ) : null}
      <View
        style={{
          width: s(22),
          height: s(22),
          borderRadius: 999,
          borderWidth: selected ? s(7) : s(2),
          borderColor: selected ? c.org : c.control,
        }}
      />
      <Text size={15.5} weight={700} oneLine style={{ flex: 1 }}>
        {label}
      </Text>
      <Text size={16} weight={700} color="ink3" tabular oneLine>
        {count == null ? '' : n(count)}
      </Text>
    </Press>
  );
}

/** s-library-filter body: shelves with counts, Sort by, "Show {n} books" (rules 10–11). */
export function FilterBody({
  shelf,
  sort,
  counts,
  onShelf,
  onSort,
  onShow,
}: {
  shelf: ShelfName;
  sort: LibrarySort;
  counts: Record<ShelfName, number | null>;
  onShelf: (s: ShelfName) => void;
  onSort: (s: LibrarySort) => void;
  onShow: () => void;
}) {
  const { s } = useTheme();
  const shown = counts[shelf] ?? 0;
  return (
    <>
      <View accessibilityRole="radiogroup" style={{ gap: s(10) }}>
        {FILTER_SHELVES.map((o) => (
          <ShelfOption
            key={o.k}
            label={o.label}
            count={counts[o.k]}
            selected={shelf === o.k}
            onPress={() => onShelf(o.k)}
          />
        ))}
      </View>
      <View style={{ gap: s(8) }}>
        <Text size={13} weight={600} oneLine>
          Sort by
        </Text>
        <Segmented options={SORTS} value={sort} onChange={onSort} />
      </View>
      <Btn label={`Show ${n(shown)} ${shown === 1 ? 'book' : 'books'}`} block onPress={onShow} />
    </>
  );
}

export function FilterSheet(
  props: Parameters<typeof FilterBody>[0] & { open: boolean; onClose: () => void },
) {
  const { open, onClose, ...body } = props;
  return (
    <Sheet open={open} onClose={onClose} title="Filter library">
      <FilterBody {...body} />
    </Sheet>
  );
}

/* ─── Pay the rest ───────────────────────────────────────────────────────── */
/** s-pay-rest-lib body: book price, already paid, left to pay; the note; one spend button. */
export function PayRestLibBody({
  price,
  paid,
  left,
  busy,
  error,
  disabled,
  onPay,
}: {
  price: number;
  paid: number;
  left: number;
  busy?: boolean;
  error?: string | null;
  disabled?: boolean;
  onPay: () => void;
}) {
  return (
    <>
      <KeyValue
        rows={[
          { k: 'Book price', v: `${n(price)} credits` },
          { k: 'Already paid', v: `− ${n(paid)}` },
          { k: 'Left to pay', v: `${n(left)} credits`, total: true },
        ]}
      />
      <Text size={13.5} color="ink2">
        The whole book downloads for offline reading, and you won't stop at chapter breaks again.
      </Text>
      {error ? <Callout tone="err">{error}</Callout> : null}
      <Btn label={`Pay ${n(left)} credits`} block loading={busy} disabled={disabled} onPress={onPay} />
    </>
  );
}

export function PayRestLibSheet({
  item,
  online,
  onClose,
  onPaid,
  onShort,
}: {
  /** The book; null keeps the sheet closed. */
  item: LibraryItem | null;
  online: boolean;
  onClose: () => void;
  /** After the charge: toast, row update and the whole-book download (rule 21). */
  onPaid: (item: LibraryItem, left: number) => void;
  /** Not enough credits or no plan: flow 03's low-balance / no-plan sheet for `left` (rule 20). */
  onShort: (item: LibraryItem, left: number) => void;
}) {
  const qc = useQueryClient();
  const track = useTrack();
  const askPush = useAskPush();
  // One idempotency key per opening, reused for every retry of the same tap (flow 03 rule 19), so a
  // double tap charges once.
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const open = item != null;
  const id = item?.book_id;
  useEffect(() => {
    if (!id) return;
    setKey(Crypto.randomUUID());
    setError(null);
    // Read the server's numbers again while the sheet is open (rule 19).
    void qc.invalidateQueries({ queryKey: ['library'] });
    // Only when the sheet opens for a book.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    if (item) track('pay_rest_viewed', { left: item.remaining_credits });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const price = item?.price_credits ?? 0;
  const left = item?.remaining_credits ?? 0;
  const pay = useMutation({
    mutationFn: async (it: LibraryItem) => {
      const { data, error: e } = await supabase.rpc('unlock_book', {
        p_book: it.book_id,
        p_expected_price: it.price_credits ?? 0,
        p_key: key,
      });
      if (e) throw e;
      return data as { balance: number; spent: number; status: string };
    },
    onSuccess: (r, it) => {
      askPush('unlock');
      track('pay_rest_confirmed', { left: r.spent });
      onPaid(it, r.spent);
    },
    onError: (e, it) => {
      const { code, detail } = rpcError(e);
      if (code === 'network') return setError('No connection. Nothing was charged. Try again.');
      if (code === 'signed_out')
        return setError('You’re signed out. Sign in again, then try. Nothing was charged.');
      setKey(Crypto.randomUUID());
      if (code === 'insufficient_credits') return onShort(it, it.remaining_credits);
      if (code === 'already_has_it') {
        // Paid on another phone meanwhile: nothing to charge, the row loses its button.
        void qc.invalidateQueries({ queryKey: ['library'] });
        return onClose();
      }
      if (code === 'price_changed') {
        // The sheet refreshes and asks for another tap (rule 19).
        void qc.invalidateQueries({ queryKey: ['library'] });
        return setError(
          `The price changed to ${n(detail.price ?? price)} credits. Check the new total and tap again.`,
        );
      }
      if (code === 'rate_limited') return setError('That’s a lot of taps. Wait a minute, then try again.');
      setError('Something went wrong. Nothing was charged. Try again.');
    },
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      locked={pay.isPending}
      bold
      title="Pay the rest"
      sub={item ? (item.pages ? `${item.title} · ${n(item.pages)} pages` : item.title) : undefined}
    >
      <PayRestLibBody
        price={price}
        paid={item?.paid_credits ?? 0}
        left={left}
        busy={pay.isPending}
        error={online ? error : 'Connect to continue.'}
        disabled={!online}
        onPay={() => item && pay.mutate(item)}
      />
    </Sheet>
  );
}

/**
 * Flow 03's unlock sheet for a library book (rule 17: "Unlock · {price}" on a preview-ended book;
 * rule 20: not enough credits or no plan from Pay the rest). It needs the book page data.
 */
export function LibraryUnlock({
  bookId,
  open,
  need,
  onClose,
  onRead,
  onPlans,
  onBuyPack,
}: {
  bookId: string;
  open: UnlockMode | 'short' | null;
  need?: number;
  onClose: () => void;
  onRead: () => void;
  onPlans: () => void;
  onBuyPack: () => void;
}) {
  const page = useBookPage(bookId);
  if (!page.data) return null;
  return (
    <UnlockSheet
      book={page.data}
      open={open}
      need={need}
      onClose={onClose}
      onRead={onRead}
      onPlans={onPlans}
      onBuyPack={onBuyPack}
    />
  );
}

/* ─── Cover menu ⋯ (rule 14; no prototype screen) ────────────────────────── */
export interface CoverMenuItem {
  key: string;
  title: string;
  sub: string;
  onPress: () => void;
}

/** Nothing in this menu spends credits. */
export function coverMenu({
  saved,
  offline,
  downloading = false,
  downloadable,
  online,
  onBook,
  onDownload,
  onRemoveDownload,
  onUnsave,
  onShare,
}: {
  saved: boolean;
  offline: boolean;
  /** A download in flight or paused: Remove reads as Cancel (rule 27). */
  downloading?: boolean;
  /** Owned or partly paid: there are files to download. */
  downloadable: boolean;
  online: boolean;
  onBook: () => void;
  onDownload: () => void;
  onRemoveDownload: () => void;
  onUnsave: () => void;
  onShare: () => void;
}): CoverMenuItem[] {
  return [
    { key: 'book', title: 'View book page', sub: 'Details, reviews and the discussion', onPress: onBook },
    ...(offline
      ? [
          downloading
            ? {
                key: 'cancel',
                title: 'Cancel download',
                sub: 'Stops it and frees the space. Your unlocks stay.',
                onPress: onRemoveDownload,
              }
            : {
                key: 'remove',
                title: 'Remove download',
                sub: 'Frees space on this phone. Your unlocks stay.',
                onPress: onRemoveDownload,
              },
        ]
      : downloadable
        ? [
            {
              key: 'download',
              title: 'Download for offline',
              sub: online ? 'Read it without a connection for 7 days' : 'Connect to continue',
              onPress: onDownload,
            },
          ]
        : []),
    ...(saved
      ? [
          {
            key: 'unsave',
            title: 'Remove from Saved',
            sub: 'You can save it again from its page',
            onPress: onUnsave,
          },
        ]
      : []),
    { key: 'share', title: 'Share', sub: 'Send this book to a friend', onPress: onShare },
  ];
}
