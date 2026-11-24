import { TextInput, View } from 'react-native';
import { Btn, Press, Text, Toggle, fontFamily, useTheme } from '@arpedia/ui';
import {
  DETAILS_MAX,
  REACTIONS,
  REASON_LABELS,
  type Reaction,
  type ReportReason as AnyReason,
} from '@arpedia/core';

// Flow 06 sheet bodies (`s-msg-actions`, `s-report`) that mirror prototype elements one to one.

const REACTION_LABELS: Record<Reaction, string> = {
  '👍': 'Thumbs up',
  '❤️': 'Love',
  '😂': 'Laugh',
  '😮': 'Wow',
  '😢': 'Sad',
  '🔥': 'Fire',
};

/** `.com-reacts`: six 48px emoji buttons, spread, line under. Its sheet body is `.pb.pt8` (4px more on top). */
export function ReactionRow({
  mine,
  disabled,
  onReact,
}: {
  mine: Reaction | null;
  disabled?: boolean;
  onReact: (r: Reaction) => void;
}) {
  const { c, s, bw } = useTheme();
  return (
    <View
      accessibilityLabel="React"
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: s(4),
        paddingTop: s(4),
        paddingHorizontal: s(2),
        paddingBottom: s(12),
        borderBottomWidth: bw(1),
        borderBottomColor: c.line,
      }}
    >
      {REACTIONS.map((r) => (
        <Press
          key={r}
          onPress={() => onReact(r)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={REACTION_LABELS[r]}
          accessibilityState={{ selected: mine === r, disabled }}
          style={{
            width: s(48),
            height: s(48),
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: mine === r ? c.surface : 'transparent',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <Text size={28} oneLine style={{ lineHeight: s(28) * 1.2 }}>
            {r}
          </Text>
        </Press>
      ))}
    </View>
  );
}

export interface OptionItem {
  key: string;
  title: string;
  sub?: string;
  danger?: boolean;
  /** Offline (flow 06 States): the row stays, dimmed, with "Connect to do this" as its sub line. */
  disabled?: boolean;
  onPress: () => void;
}

/** `.option-list.option-list--flush` of `.option.option--compact` rows (edge to edge in the sheet). */
export function OptionList({ items }: { items: OptionItem[] }) {
  const { c, s, bw } = useTheme();
  return (
    // .pb .option-list--flush: margin 0 -18px
    <View style={{ marginHorizontal: -s(18) }}>
      {items.map((o, i) => (
        <Press
          key={o.key}
          onPress={o.onPress}
          disabled={o.disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!o.disabled }}
          accessibilityLabel={o.sub ? `${o.title}, ${o.sub}` : o.title}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(12),
            paddingVertical: s(12),
            paddingHorizontal: s(14),
            minHeight: s(48),
            opacity: o.disabled ? 0.5 : 1,
            ...(i ? { borderTopWidth: bw(1), borderTopColor: c.line } : null),
          }}
        >
          <View style={{ flex: 1, minWidth: 0, gap: s(2) }}>
            <Text size={15.5} weight={700} color={o.danger ? 'err' : 'ink'} oneLine>
              {o.title}
            </Text>
            {o.sub ? (
              <Text size={13} color="ink2" ellipsis>
                {o.sub}
              </Text>
            ) : null}
          </View>
        </Press>
      ))}
    </View>
  );
}

export const REPORT_REASONS = [
  { key: 'spam', label: 'Spam or scam' },
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'hate', label: 'Hate speech' },
  { key: 'sexual', label: 'Sexual content' },
  { key: 'violence', label: 'Violence or threats' },
  { key: 'self_harm', label: 'Self-harm' },
  { key: 'copyright', label: 'Copyright infringement' },
  { key: 'other', label: 'Something else' },
] as const;
/** Any report reason; the sheet shows the list for the content type (flow 14 rule 3). */
export type ReportReason = AnyReason;
const SHEET_LABELS: Record<ReportReason, string> = {
  ...REASON_LABELS,
  ...Object.fromEntries(REPORT_REASONS.map((r) => [r.key, r.label])),
};
const SHEET_REASONS: readonly ReportReason[] = REPORT_REASONS.map((r) => r.key);

/** `s-report` body: intro, radio list, details field, Also block toggle, Cancel and Send report. */
export function ReportBody({
  name,
  reason,
  details,
  alsoBlock,
  canBlock,
  reasons = SHEET_REASONS,
  sending,
  onReason,
  onDetails,
  onAlsoBlock,
  onCancel,
  onSend,
}: {
  name: string;
  reason: ReportReason | null;
  details: string;
  alsoBlock: boolean;
  canBlock: boolean;
  /** Reasons for this content type (`reasonsFor`); the prototype's eight when left out. */
  reasons?: readonly ReportReason[];
  sending?: boolean;
  onReason: (r: ReportReason) => void;
  onDetails: (d: string) => void;
  onAlsoBlock: (v: boolean) => void;
  onCancel: () => void;
  onSend: () => void;
}) {
  const { c, s, bw } = useTheme();
  const first = name.split(/\s+/)[0] ?? name;
  const family = fontFamily('ui', 400);
  return (
    <>
      <Text size={13.5} color="ink2" style={{ lineHeight: s(13.5) * 1.45 }}>
        {`Moderators review reports within 24 hours for serious reports and within 3 days for others. ${first} won't know who reported.`}
      </Text>
      <View accessibilityRole="radiogroup" style={{ marginHorizontal: -s(18) }}>
        {reasons.map((key, i) => {
          const on = reason === key;
          return (
            <Press
              key={key}
              onPress={() => onReason(key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={SHEET_LABELS[key]}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: s(12),
                paddingVertical: s(12),
                paddingHorizontal: s(14),
                minHeight: s(48),
                backgroundColor: on ? c.orgTint2 : c.white,
                boxShadow: on ? `inset 0 0 0 ${s(2)}px ${c.org}` : undefined,
                ...(i && !on ? { borderTopWidth: bw(1), borderTopColor: c.line } : null),
              }}
            >
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
              <Text size={15.5} weight={700} oneLine style={{ flex: 1 }}>
                {SHEET_LABELS[key]}
              </Text>
            </Press>
          );
        })}
      </View>
      <View
        style={{
          backgroundColor: c.surface,
          borderRadius: s(12),
          minHeight: s(50),
          paddingHorizontal: s(14),
          justifyContent: 'center',
        }}
      >
        <TextInput
          value={details}
          onChangeText={onDetails}
          placeholder="Add details (optional)"
          placeholderTextColor={c.ink3}
          selectionColor={c.org}
          cursorColor={c.org}
          maxLength={DETAILS_MAX}
          multiline
          accessibilityLabel="Details"
          style={{
            paddingVertical: s(12),
            paddingHorizontal: 0,
            includeFontPadding: false,
            fontFamily: family,
            fontSize: s(14),
            color: c.ink,
          }}
        />
      </View>
      {canBlock ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
          <View style={{ flex: 1, minWidth: 0, gap: s(4) }}>
            <Text size={15} weight={600} oneLine style={{ lineHeight: s(15) * 1.3 }}>
              {`Also block ${first}`}
            </Text>
            <Text size={12} color="ink3" style={{ lineHeight: s(12) * 1.4 }}>
              Hide their messages everywhere. They aren't told.
            </Text>
          </View>
          <Toggle value={alsoBlock} onChange={onAlsoBlock} label={`Also block ${first}`} />
        </View>
      ) : null}
      {/* .com-sheet-foot: grid 1fr 1.4fr, gap 8, padding-top 4 */}
      <View style={{ flexDirection: 'row', gap: s(8), paddingTop: s(4) }}>
        <View style={{ flex: 1 }}>
          <Btn label="Cancel" variant="g" block onPress={onCancel} />
        </View>
        <View style={{ flex: 1.4 }}>
          <Btn label="Send report" block disabled={!reason} loading={sending} onPress={onSend} />
        </View>
      </View>
    </>
  );
}
