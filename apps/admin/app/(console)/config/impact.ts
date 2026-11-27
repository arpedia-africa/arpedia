/** Phones that opened the app in the last 7 days and how many are below the saved minimum (rule 25). */
export interface ForceUpdateImpact {
  phones: number;
  phones_below: number;
  readers: number;
  readers_below: number;
  share_pct: number;
}

const num = (n: number) => n.toLocaleString('en-NG');

/** What the force update confirmation says it locks out. */
export function impactText(impact: ForceUpdateImpact | null): string {
  if (!impact) return "Couldn't count who it locks out. Reload the page before you turn it on.";
  if (impact.phones === 0) return 'No phone opened Arpedia in the last 7 days, so nobody is locked out yet.';
  if (impact.readers_below === 0) return 'Nobody. Every phone that opened Arpedia in the last 7 days is on the minimum or newer.';
  return (
    `${num(impact.readers_below)} ${impact.readers_below === 1 ? 'reader' : 'readers'}: ${impact.share_pct}% of phones ` +
    `that opened Arpedia in the last 7 days (${num(impact.phones_below)} of ${num(impact.phones)}).`
  );
}
