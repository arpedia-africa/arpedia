import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Btn, Callout, Cell, Group, Sheet, useTheme, useToast } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';

// s-book-more (rule 11) and its report sheet. Views stay pure for tools/parity.

export interface MoreItem {
  key: string;
  title: string;
  sub: string;
  onPress: () => void;
}

/** `.group.group--flush.rd-menu` inside a bold sheet: rows edge to edge, no `.pb` padding. */
export function MenuBody({ items }: { items: MoreItem[] }) {
  const { s } = useTheme();
  return (
    <View style={{ marginHorizontal: s(-18), marginTop: s(-16) }}>
      <Group flush>
        {items.map((it) => (
          <Cell key={it.key} title={it.title} sub={it.sub} onPress={it.onPress} flush />
        ))}
      </Group>
    </View>
  );
}

/** The ⋯ menu items for a book (Gift hidden for coming-soon books, Tip hidden on your own book). */
export function moreItems({
  author,
  comingSoon,
  isAuthor,
  online,
  onDownload,
  onGift,
  onTip,
  onReport,
}: {
  author: string;
  comingSoon: boolean;
  isAuthor: boolean;
  online: boolean;
  onDownload: () => void;
  onGift: () => void;
  onTip: () => void;
  onReport: () => void;
}): MoreItem[] {
  const off = 'Connect to continue';
  const first = author.split(' ')[0] || 'the author';
  return [
    ...(comingSoon
      ? []
      : [
          {
            key: 'download',
            title: 'Download for offline',
            sub: 'Whole book with Unlock all; paid chapters with pay as you read',
            onPress: onDownload,
          },
          {
            key: 'gift',
            title: 'Gift this book',
            sub: online ? 'Send it to a friend with your credits' : off,
            onPress: onGift,
          },
        ]),
    ...(isAuthor
      ? []
      : [
          {
            key: 'tip',
            title: 'Tip the author',
            sub: online ? `Credits go straight to ${first}` : off,
            onPress: onTip,
          },
          {
            key: 'report',
            title: 'Report this book',
            sub: online ? 'Wrong content, copyright or abuse' : off,
            onPress: onReport,
          },
        ]),
  ];
}

const REASONS = [
  { key: 'wrong_content', title: 'Wrong content', sub: 'The book isn’t what the page says it is' },
  { key: 'copyright', title: 'Copyright', sub: 'Someone else wrote it, or it was copied' },
  { key: 'abuse', title: 'Abuse', sub: 'Hate, harassment or harmful content' },
] as const;

/** Report this book: pick a reason; writes a `reports` row (flow 14). */
export function ReportSheet({
  bookId,
  open,
  onClose,
}: {
  bookId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { s } = useTheme();
  const toast = useToast();
  const [reason, setReason] = useState<string | null>(null);
  useEffect(() => {
    if (open) setReason(null);
  }, [open]);
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('report_book', { p_book: bookId, p_reason: reason! });
      if (error) throw error;
    },
    onSuccess: () => {
      onClose();
      toast({ message: 'Thanks. Our team will look at it.' });
    },
  });
  return (
    <Sheet open={open} onClose={onClose} locked={send.isPending} title="Report this book">
      <View style={{ marginHorizontal: s(-18) }}>
        <Group flush>
          {REASONS.map((r) => (
            <Cell
              key={r.key}
              title={r.title}
              sub={r.sub}
              highlight={reason === r.key}
              onPress={() => setReason(r.key)}
              flush
            />
          ))}
        </Group>
      </View>
      {send.isError ? (
        <Callout tone="err">That didn’t send. Check your connection and try again.</Callout>
      ) : null}
      <Btn
        label="Send report"
        block
        disabled={!reason}
        loading={send.isPending}
        onPress={() => send.mutate()}
      />
    </Sheet>
  );
}
