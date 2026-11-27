import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { REASON_LABELS, reasonsFor, type ReportReason } from '@arpedia/core';
import { Btn, Callout, Cell, Group, Sheet, useTheme, useToast } from '@arpedia/ui';
import { REPORT_SAVED, REPORT_SENT, reportErrorCopy, useReport } from '../14/report';

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

/**
 * The ⋯ menu items for a book (Gift hidden for coming-soon books, Tip hidden on your own book).
 * Download, Gift and Tip also hide while their feature flag is off (flow 16 rule 27).
 */
export function moreItems({
  author,
  comingSoon,
  isAuthor,
  online,
  onDownload,
  onGift,
  onTip,
  onReport,
  flags = { downloads: true, gifts: true, tips: true },
}: {
  author: string;
  comingSoon: boolean;
  isAuthor: boolean;
  online: boolean;
  onDownload: () => void;
  onGift: () => void;
  onTip: () => void;
  onReport: () => void;
  flags?: { downloads: boolean; gifts: boolean; tips: boolean };
}): MoreItem[] {
  const off = 'Connect to continue';
  const first = author.split(' ')[0] || 'the author';
  return [
    ...(comingSoon
      ? []
      : [
          ...(flags.downloads
            ? [
                {
                  key: 'download',
                  title: 'Download for offline',
                  sub: 'Whole book with Unlock all; paid chapters with pay as you read',
                  onPress: onDownload,
                },
              ]
            : []),
          ...(flags.gifts
            ? [
                {
                  key: 'gift',
                  title: 'Gift this book',
                  sub: online ? 'Send it to a friend with your credits' : off,
                  onPress: onGift,
                },
              ]
            : []),
        ]),
    ...(isAuthor
      ? []
      : [
          ...(flags.tips
            ? [
                {
                  key: 'tip',
                  title: 'Tip the author',
                  sub: online ? `Credits go straight to ${first}` : off,
                  onPress: onTip,
                },
              ]
            : []),
          {
            key: 'report',
            title: 'Report this book',
            // Reports queue offline and send on reconnect (flow 14 States: Offline).
            sub: 'Wrong content, copyright or abuse',
            onPress: onReport,
          },
        ]),
  ];
}

// Flow 14 rule 3: a book offers Copyright infringement, Sexual content, Something else.
const SUBS: Partial<Record<ReportReason, string>> = {
  copyright: 'Someone else wrote it, or it was copied',
  sexual: 'Explicit content that isn’t marked or allowed',
  other: 'Wrong content, abuse or anything else',
};
const REASONS = reasonsFor('book').map((key) => ({ key, title: REASON_LABELS[key], sub: SUBS[key] }));

/** Report this book: pick a reason; flow 14 `create_report` (copyright also opens a claim). Queued offline. */
export function ReportSheet({
  bookId,
  open,
  online,
  onClose,
}: {
  bookId: string;
  open: boolean;
  online: boolean;
  onClose: () => void;
}) {
  const { s } = useTheme();
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const reportFlow = useReport();
  const send = useMutation({
    mutationFn: () => reportFlow.send({ content_type: 'book', content_id: bookId, reason: reason! }, !online),
    onSuccess: (ref) => {
      onClose();
      toast({ message: ref === null ? REPORT_SAVED : REPORT_SENT, duration: 6000 });
    },
  });
  const { reset } = send;
  useEffect(() => {
    if (!open) return;
    setReason(null);
    reset();
    reportFlow.started('book');
  }, [open, reset, reportFlow]);
  const refused = send.error ? reportErrorCopy(String(send.error.message)) : null;
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
      {refused ? <Callout tone="err">{refused}</Callout> : null}
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
