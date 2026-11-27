/** The Overview numbers that need more than a period total (flow 15 rule 25). */

type Series = { series: { day: string; value: number | null }[] } | undefined;

/** Monthly readers on the last day of the period that has a figure; null when under 5 or none. */
export function latest(m: Series): number | null {
  const rows = [...(m?.series ?? [])].sort((a, b) => a.day.localeCompare(b.day));
  const last = rows.at(-1);
  return last?.value ?? null;
}

const pct = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('en-NG')}%`;

/** "DAU/MAU 31.5%": average daily readers over monthly readers. */
export function stickiness(avgDau: number | null, mau: number | null): string | null {
  return avgDau != null && mau ? `DAU/MAU ${pct((100 * avgDau) / mau)}` : null;
}

/** "17% of books started": books finished in the period over books started in it. */
export function finishedShare(finished: number | null, started: number | null): string | null {
  return finished != null && started ? `${pct((100 * finished) / started)} of books started` : null;
}

/** A share from the server (null when the group is under 5 readers). */
export const share = (n: number | null | undefined) => (n == null ? null : pct(n));
