// epubcheck's JSON report → `file_check_error` flags for the desk push (rule 21). Errors and fatal
// errors become flags; warnings and notes stay in the saved report only. The Worker accepts up
// to 200 flags of up to 500 characters.

export interface EpubcheckReport {
  messages?: {
    ID?: string;
    severity?: string;
    message?: string;
    locations?: { path?: string; line?: number; column?: number }[];
  }[];
}
export interface DeskFlag {
  check_key: 'file_check_error';
  message: string;
  suggestion?: string;
}

export const MAX_FLAGS = 200;
const clip = (s: string, n = 500) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function reportFlags(report: EpubcheckReport): DeskFlag[] {
  const flags: DeskFlag[] = [];
  const seen = new Set<string>();
  for (const m of report.messages ?? []) {
    if (m.severity !== 'ERROR' && m.severity !== 'FATAL') continue;
    const where = m.locations?.[0];
    const at = where?.path
      ? ` (${where.path.replace(/^OEBPS\//, '')}${where.line && where.line > 0 ? `, line ${where.line}` : ''})`
      : '';
    const message = clip(`epubcheck ${m.ID ?? ''}: ${(m.message ?? '').trim()}${at}`.replace(/\s+/g, ' '));
    if (seen.has(message)) continue;
    seen.add(message);
    flags.push({ check_key: 'file_check_error', message });
    if (flags.length === MAX_FLAGS) break;
  }
  return flags;
}
