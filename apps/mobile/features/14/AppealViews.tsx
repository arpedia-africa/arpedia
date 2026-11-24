// Flow 14 · rule 26: the decision message with Appeal. No prototype screen of its own: built from the
// kit's card, text, button, sheet, field and callout (as flow 13's BankSheet is).
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Btn, Callout, Card, Field, Sheet, Text, useTheme } from '@arpedia/ui';
import { APPEAL_MAX, appealErrorCopy, appealLine, decisionTitle, type ModerationRow } from '@arpedia/core';

/** One card per decision, above the notifications feed. */
export function DecisionCards({
  rows,
  onAppeal,
}: {
  rows: ModerationRow[];
  onAppeal: (r: ModerationRow) => void;
}) {
  const { s } = useTheme();
  if (!rows.length) return null;
  return (
    <View style={{ paddingTop: s(18), paddingHorizontal: s(16), gap: s(10) }}>
      {rows.map((r) => {
        const line = appealLine(r);
        return (
          <Card key={r.action_id}>
            <View style={{ gap: s(6) }}>
              <Text size={14.5} weight={700}>
                {decisionTitle(r)}
              </Text>
              {r.message ? (
                <Text size={13.5} color="ink2">
                  {r.message}
                </Text>
              ) : null}
              {line ? (
                <Text size={12.5} color="ink3">
                  {line}
                </Text>
              ) : null}
              {r.can_appeal ? (
                <View style={{ flexDirection: 'row', paddingTop: s(4) }}>
                  <Btn label="Appeal" variant="g" size="sm" onPress={() => onAppeal(r)} />
                </View>
              ) : null}
            </View>
          </Card>
        );
      })}
    </View>
  );
}

/** Appeal text (up to 1,000 characters) and Send. */
export function AppealSheet({
  open,
  title,
  offline,
  sending,
  error,
  onClose,
  onSend,
}: {
  open: boolean;
  /** The decision being appealed, as the card names it. */
  title: string;
  offline: boolean;
  sending: boolean;
  /** Server error message, mapped here to plain words. */
  error: string | null;
  onClose: () => void;
  onSend: (text: string) => void;
}) {
  const { s } = useTheme();
  const [text, setText] = useState('');
  useEffect(() => {
    if (!open) setText('');
  }, [open]);
  const ready = text.trim().length > 0 && !offline;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      locked={sending}
      title="Appeal this decision"
      footer={
        <Btn label="Send appeal" block disabled={!ready} loading={sending} onPress={() => onSend(text)} />
      }
    >
      <View style={{ gap: s(14) }}>
        <Text size={13.5} color="ink2">
          {title}. Tell us why you think we got it wrong. A different person from the one who decided will
          look at it and reply within 3 days.
        </Text>
        <Field
          label="Your appeal"
          placeholder="What should we know?"
          value={text}
          onChangeText={(t) => setText(t.slice(0, APPEAL_MAX))}
          maxLength={APPEAL_MAX}
          multiline
          rows={5}
          error={error ? appealErrorCopy(error) : undefined}
          hint={`${text.length.toLocaleString('en-NG')} / ${APPEAL_MAX.toLocaleString('en-NG')}`}
        />
        {offline ? <Callout tone="warn">You’re offline. Connect to send your appeal.</Callout> : null}
      </View>
    </Sheet>
  );
}
