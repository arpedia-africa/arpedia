// Flow 14 · rules 30 and 31: the author answers a claim on their book. No prototype screen of its
// own: built from the kit's sheet, text, field, callout and button, as AppealSheet is.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Btn, Callout, Field, Sheet, Text, useTheme } from '@arpedia/ui';
import { CLAIM_ANSWER_MAX, claimErrorCopy, dayMonth, type AuthorClaim } from '@arpedia/core';

export function ClaimAnswerSheet({
  claim,
  bookTitle,
  offline,
  sending,
  error,
  onClose,
  onSend,
}: {
  claim: AuthorClaim | null;
  bookTitle: string;
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
    setText(claim?.author_response ?? '');
  }, [claim]);
  const ready = text.trim().length > 0 && text.trim() !== (claim?.author_response ?? '').trim() && !offline;
  const due = claim ? dayMonth(claim.author_due_at ?? claim.due_at) : '';
  return (
    <Sheet
      open={!!claim}
      onClose={onClose}
      locked={sending}
      title="Answer the claim"
      footer={
        <Btn
          label={claim?.author_response ? 'Send new answer' : 'Send answer'}
          block
          disabled={!ready}
          loading={sending}
          onPress={() => onSend(text)}
        />
      }
    >
      <View style={{ gap: s(14) }}>
        <Text size={13.5} color="ink2">
          {`Someone has made a claim about ${bookTitle} (${claim?.ref ?? ''}). Tell us where the book comes from, or why you have the right to publish it. Our team reads your answer before deciding. Answer by ${due}.`}
        </Text>
        {claim?.details?.trim() ? (
          <Callout tone="quiet">{`What they told us: “${claim.details.trim()}”`}</Callout>
        ) : null}
        <Field
          label="Your answer"
          placeholder="Where does this book come from?"
          value={text}
          onChangeText={(t) => setText(t.slice(0, CLAIM_ANSWER_MAX))}
          maxLength={CLAIM_ANSWER_MAX}
          multiline
          rows={6}
          error={error ? claimErrorCopy(error) : undefined}
          hint={`${text.length.toLocaleString('en-NG')} / ${CLAIM_ANSWER_MAX.toLocaleString('en-NG')}`}
        />
        {offline ? <Callout tone="warn">You’re offline. Connect to send your answer.</Callout> : null}
      </View>
    </Sheet>
  );
}
