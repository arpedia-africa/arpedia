// Flow 13 · the Flutterwave calls payouts need, behind one interface so tests (and a local stack
// without Flutterwave keys) use a stand-in. Staging and production never fall back to the stand-in.
import type { Env } from '../../env';

const FLW = 'https://api.flutterwave.com/v3';

export interface FlwTransfer {
  id: number;
  reference: string;
  status: string;
  amount: number;
  complete_message?: string | null;
}

export interface PayoutClient {
  banks(): Promise<{ code: string; name: string }[]>;
  /**
   * The name the bank holds for this account; throws FlwError(400) when it doesn't resolve. `localName`
   * is only read by the local stand-in (Flutterwave answers with the bank's own record).
   */
  resolveAccount(bankCode: string, accountNumber: string, localName?: string): Promise<string>;
  /** `reference` doubles as Flutterwave's idempotency key: the same reference never pays twice. */
  createTransfer(t: {
    reference: string;
    amountKobo: number;
    bankCode: string;
    accountNumber: string;
    narration: string;
  }): Promise<{ id: number; status: string }>;
  getTransfer(id: string | number): Promise<FlwTransfer>;
  balanceKobo(): Promise<number>;
}

/** A Flutterwave answer that wasn't a success; 4xx is final, 5xx and network errors may pass later. */
export class FlwError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function live(key: string): PayoutClient {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${FLW}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
    });
    const json = (await res.json().catch(() => null)) as {
      status?: string;
      message?: string;
      data?: T;
    } | null;
    if (!res.ok || json?.status !== 'success') {
      throw new FlwError(res.status, `flutterwave ${path}: ${res.status} ${json?.message ?? ''}`);
    }
    return json.data as T;
  }
  return {
    banks: async () =>
      (await call<{ code: string; name: string }[]>('/banks/NG')).map((b) => ({
        code: b.code,
        name: b.name,
      })),
    resolveAccount: async (bankCode, accountNumber) =>
      (
        await call<{ account_name: string }>('/accounts/resolve', {
          method: 'POST',
          body: JSON.stringify({ account_bank: bankCode, account_number: accountNumber }),
        })
      ).account_name,
    createTransfer: (t) =>
      call<{ id: number; status: string }>('/transfers', {
        method: 'POST',
        body: JSON.stringify({
          account_bank: t.bankCode,
          account_number: t.accountNumber,
          amount: t.amountKobo / 100,
          currency: 'NGN',
          debit_currency: 'NGN',
          reference: t.reference,
          narration: t.narration,
        }),
      }),
    getTransfer: (id) => call<FlwTransfer>(`/transfers/${encodeURIComponent(String(id))}`),
    balanceKobo: async () =>
      Math.round((await call<{ available_balance: number }>('/balances/NGN')).available_balance * 100),
  };
}

/**
 * Local stand-in: a short bank list; a number starting 000 doesn't resolve, one starting 9 resolves to
 * someone else (so it goes to review), any other to `localName`; transfers succeed at once.
 */
export function fakePayoutClient(): PayoutClient {
  const transfers = new Map<number, FlwTransfer>();
  return {
    banks: async () => [
      { code: '044', name: 'Access Bank' },
      { code: '058', name: 'GTBank' },
      { code: '057', name: 'Zenith Bank' },
      { code: '033', name: 'United Bank for Africa' },
      { code: '50515', name: 'Moniepoint MFB' },
      { code: '999992', name: 'OPay' },
    ],
    resolveAccount: async (_bank, n, localName) => {
      if (n.startsWith('000'))
        throw new FlwError(400, 'flutterwave /accounts/resolve: 400 could not resolve');
      return n.startsWith('9') || !localName ? 'TEST ACCOUNT HOLDER' : localName.toUpperCase();
    },
    createTransfer: async (t) => {
      const existing = [...transfers.values()].find((x) => x.reference === t.reference);
      if (existing) return { id: existing.id, status: existing.status };
      const id = transfers.size + 1;
      transfers.set(id, { id, reference: t.reference, status: 'SUCCESSFUL', amount: t.amountKobo / 100 });
      return { id, status: 'SUCCESSFUL' };
    },
    getTransfer: async (id) => {
      const t = transfers.get(Number(id));
      if (!t) throw new FlwError(404, 'flutterwave /transfers: 404');
      return t;
    },
    balanceKobo: async () => 50_000_000_00,
  };
}

let localFake: PayoutClient | null = null;

/** The client for this environment, or null when Flutterwave isn't configured (staging, production). */
export function payoutClient(env: Env): PayoutClient | null {
  if (env.FLUTTERWAVE_SECRET_KEY) return live(env.FLUTTERWAVE_SECRET_KEY);
  if (env.APP_ENV !== 'local') return null;
  return (localFake ??= fakePayoutClient());
}
