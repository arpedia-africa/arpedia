/** s-staff-alerts: one alert from get_staff_alerts(). */
export interface StaffAlert {
  kind: 'high_severity_reports' | 'failed_payouts' | 'copyright_claims' | 'applications_waiting' | 'system_health';
  at: string;
  tone: 'err' | 'org';
  href: string;
  title: string;
  detail: string;
  new: boolean;
}

export interface StaffAlerts {
  items: StaffAlert[];
  new_count: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const lagosDay = (t: number) => {
  const d = new Date(t + 3_600_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/** "just now", "6 min ago", "3 h ago", "yesterday", then "2 Nov" (Lagos time), as in the prototype. */
export function ago(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const mins = Math.floor((now - t) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const days = Math.round((lagosDay(now) - lagosDay(t)) / 86_400_000);
  if (days === 0) return `${Math.floor(mins / 60)} h ago`;
  if (days === 1) return 'yesterday';
  const d = new Date(t + 3_600_000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "4 new since you signed in" in the drawer head. */
export const newLine = (n: number) => (n ? `${n.toLocaleString('en-NG')} new since you signed in` : 'Nothing new since you signed in');
