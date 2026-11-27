/**
 * Partial release (flow 13 edge "Flutterwave balance below the sendable amount", spec check 13-12):
 * which lines go now when the balance is short. Same order as the server's `release_cycle_part`
 * (smallest amount first, then author id), so the preview matches what is sent. Each line is sent
 * whole or not at all; the rest stays approved, not sent.
 */
export interface PartLine {
  author_id: string;
  payable_kobo: number;
}

export interface PartPlan<T extends PartLine> {
  send: T[];
  left: T[];
  sendKobo: number;
  leftKobo: number;
}

export function partPlan<T extends PartLine>(lines: T[], budgetKobo: number | null): PartPlan<T> {
  const sorted = [...lines]
    .filter(l => l.payable_kobo > 0)
    .sort((a, b) => a.payable_kobo - b.payable_kobo || (a.author_id < b.author_id ? -1 : a.author_id > b.author_id ? 1 : 0));
  const send: T[] = [];
  let sendKobo = 0;
  let i = 0;
  for (; i < sorted.length; i++) {
    const l = sorted[i]!;
    if (budgetKobo != null && sendKobo + l.payable_kobo > budgetKobo) break;
    send.push(l);
    sendKobo += l.payable_kobo;
  }
  const left = sorted.slice(i);
  return { send, left, sendKobo, leftKobo: left.reduce((a, l) => a + l.payable_kobo, 0) };
}
