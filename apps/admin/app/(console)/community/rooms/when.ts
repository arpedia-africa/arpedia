// Room times in Lagos time, as the prototype writes them: "10:15 today" (live, started),
// "Today 20:00", "Yesterday 21:10", "Sat 14 Nov, 17:00".
const TZ = 'Africa/Lagos';
const DAY = 86_400_000;

const clock = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
/** Lagos is UTC+1 all year. */
const dayIndex = (d: Date) => Math.floor((d.getTime() + 3_600_000) / DAY);

export function roomWhen(iso: string, startedToday = false, now: Date = new Date()): string {
  const d = new Date(iso);
  const diff = dayIndex(d) - dayIndex(now);
  if (diff === 0) return startedToday ? `${clock(d)} today` : `Today ${clock(d)}`;
  if (diff === -1) return `Yesterday ${clock(d)}`;
  if (diff === 1) return `Tomorrow ${clock(d)}`;
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ }).replace(',', '');
  return `${day}, ${clock(d)}`;
}

/** Save text as a file from the browser. */
export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
