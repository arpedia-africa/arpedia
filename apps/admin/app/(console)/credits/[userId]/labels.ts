// How a ledger row reads on the reader's credits page and in the CSV export (s-user-credits).

export type Filter = 'plan' | 'books' | 'messages' | 'gifts' | 'staff';

export const FILTERS: [Filter | 'all', string][] = [
  ['all', 'All'],
  ['plan', 'Plan and top-ups'],
  ['books', 'Books and chapters'],
  ['messages', 'Messages'],
  ['gifts', 'Tips and gifts'],
  ['staff', 'Staff and refunds'],
];

/** The Type column. A staff return is an `undo` row with a staff actor; a reader's own undo has none. */
export function typeLabel(reason: string, staff: boolean): string {
  switch (reason) {
    case 'plan_grant':
      return 'Plan grant';
    case 'rollover':
      return 'Rollover';
    case 'top_up':
      return 'Top-up';
    case 'unlock_all':
      return 'Book, upfront';
    case 'chapter':
      return 'Pay as you read';
    case 'undo':
      return staff ? 'Staff return' : 'Chapter undone';
    case 'tip':
      return 'Tip';
    case 'message':
      return 'DM to author';
    case 'expiry':
      return 'Expiry';
    case 'refund':
      return 'Refund clawback';
    case 'staff_adjust':
      return 'Staff grant';
    case 'gift_out':
      return 'Gift sent';
    case 'gift_in':
      return 'Gift received';
    case 'promo':
      return 'Promo';
    default:
      return reason;
  }
}

/** Which quick filter a row belongs to. */
export function filterOf(reason: string, staff: boolean): Filter {
  if (['plan_grant', 'rollover', 'top_up', 'promo', 'expiry'].includes(reason)) return 'plan';
  if (reason === 'unlock_all' || reason === 'chapter' || (reason === 'undo' && !staff)) return 'books';
  if (reason === 'message') return 'messages';
  if (['tip', 'gift_out', 'gift_in'].includes(reason)) return 'gifts';
  return 'staff';
}

const PREFIX: Record<string, string> = {
  chapter: 'ch',
  unlock_all: 'ul',
  message: 'dm',
  tip: 'tp',
  gift_out: 'gf',
  gift_in: 'gf',
  staff_adjust: 'sg',
  undo: 'sg',
  expiry: 'ex',
  refund: 'rf',
  plan_grant: 'pg',
  top_up: 'tu',
  rollover: 'ro',
  promo: 'pr',
};

/** The Reference column: the store or provider id when there is one, else a short id from the action. */
export function refOf(r: { reason: string; ref_id: string | null; txn_id: string }): string {
  if (r.ref_id && r.ref_id.length <= 28) return r.ref_id;
  return `${PREFIX[r.reason] ?? 'tx'}_${r.txn_id.replaceAll('-', '').slice(0, 6)}`;
}

export const userCode = (id: string) => `usr_${id.replaceAll('-', '').slice(0, 8)}`;
