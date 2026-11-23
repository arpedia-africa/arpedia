// Flow 13 · add or change the payout account (rule 21): bank, 10-digit number, the name the bank
// holds shown before saving. No prototype screen of its own: built from the kit's sheet, field, cell,
// key-value, callout and button, in the order s-studio-payout reads.
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Btn, Callout, Cell, Field, Group, KeyValue, Sheet, Text, useTheme } from '@arpedia/ui';
import { isAccountNumber } from '@arpedia/core';
import { BankError, resolveAccount, useBanks, useSaveAccount } from './payouts';

type Step = 'bank' | 'number';

export function BankSheet({
  open,
  uid,
  replacing,
  offline,
  onClose,
  onSaved,
}: {
  open: boolean;
  uid: string | undefined;
  /** An account exists: this is a change, so the 48-hour pause applies. */
  replacing: boolean;
  offline: boolean;
  onClose: () => void;
  onSaved: (autoVerified: boolean, bankName: string) => void;
}) {
  const { s } = useTheme();
  const banks = useBanks(open);
  const save = useSaveAccount(uid);
  const [step, setStep] = useState<Step>('bank');
  const [query, setQuery] = useState('');
  const [bank, setBank] = useState<{ code: string; name: string } | null>(null);
  const [number, setNumber] = useState('');
  const [resolved, setResolved] = useState<{ name: string; for: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep('bank');
      setQuery('');
      setBank(null);
      setNumber('');
      setResolved(null);
      setError(null);
    }
  }, [open]);

  // Ask the bank for the name as soon as the number is complete.
  const key = bank && isAccountNumber(number) ? `${bank.code}:${number}` : null;
  useEffect(() => {
    if (!key || offline || resolved?.for === key) return;
    let live = true;
    setChecking(true);
    setError(null);
    resolveAccount(bank!.code, number)
      .then((r) => live && setResolved({ name: r.account_name, for: key }))
      .catch((e) => live && setError(e instanceof BankError ? e.message : 'Something went wrong. Try again.'))
      .finally(() => live && setChecking(false));
    return () => {
      live = false;
    };
  }, [key, offline, resolved?.for, bank, number]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (banks.data ?? []).filter((b) => !q || b.name.toLowerCase().includes(q));
  }, [banks.data, query]);

  const ready = !!key && resolved?.for === key && !offline;
  const submit = () => {
    if (!bank || !ready) return;
    save.mutate(
      { bank_code: bank.code, account_number: number },
      {
        onSuccess: (r) => onSaved(r.auto_verified, bank.name),
        onError: (e) => setError(e instanceof BankError ? e.message : 'Something went wrong. Try again.'),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      locked={save.isPending}
      title={replacing ? 'Change payout account' : 'Add bank account'}
      footer={
        step === 'number' ? (
          <Btn label="Save account" block disabled={!ready} loading={save.isPending} onPress={submit} />
        ) : undefined
      }
    >
      {step === 'bank' ? (
        <View style={{ gap: s(12) }}>
          <Field
            icon="search"
            placeholder="Search banks"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          {banks.isError ? (
            <Callout tone="err">
              {offline
                ? 'You’re offline. Connect to add a bank account.'
                : 'Banks didn’t load. Close and try again.'}
            </Callout>
          ) : (
            <ScrollView style={{ maxHeight: s(360) }} keyboardShouldPersistTaps="handled">
              <Group flush>
                {banks.isPending ? (
                  <Cell title="Loading banks…" />
                ) : shown.length ? (
                  shown.map((b) => (
                    <Cell
                      key={b.code}
                      title={b.name}
                      chevron
                      flush
                      onPress={() => {
                        setBank(b);
                        setResolved(null);
                        setError(null);
                        setStep('number');
                      }}
                    />
                  ))
                ) : (
                  <Cell title="No bank matches that" sub="Check the spelling" />
                )}
              </Group>
            </ScrollView>
          )}
        </View>
      ) : (
        <View style={{ gap: s(16) }}>
          <Group flush>
            <Cell
              title={bank?.name ?? ''}
              sub="Tap to choose another bank"
              chevron
              flush
              onPress={() => setStep('bank')}
            />
          </Group>
          <Field
            label="Account number"
            placeholder="10 digits"
            value={number}
            onChangeText={(t) => setNumber(t.replace(/\D/g, '').slice(0, 10))}
            keyboardType="number-pad"
            maxLength={10}
            error={error ?? undefined}
            hint={checking ? 'Checking with your bank…' : undefined}
          />
          {resolved?.for === key ? (
            <>
              <KeyValue rows={[{ k: 'Name on the account', v: resolved.name }]} />
              <Text size={12} color="ink3">
                Check this is your name. It should match the legal name on your author application.
              </Text>
            </>
          ) : null}
          {replacing ? (
            <Callout tone="info">Changing account pauses payouts for 48 hours for safety.</Callout>
          ) : null}
          {offline ? <Callout tone="warn">You’re offline. Connect to save a bank account.</Callout> : null}
        </View>
      )}
    </Sheet>
  );
}
