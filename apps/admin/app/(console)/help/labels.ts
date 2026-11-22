export type HelpCategory =
  'getting_started' | 'credits_plans' | 'reading' | 'community' | 'authors' | 'account_privacy';

export const CATEGORIES: { key: HelpCategory; label: string }[] = [
  { key: 'getting_started', label: 'Getting started' },
  { key: 'credits_plans', label: 'Credits and plans' },
  { key: 'reading', label: 'Reading' },
  { key: 'community', label: 'Community' },
  { key: 'authors', label: 'Authors' },
  { key: 'account_privacy', label: 'Account and privacy' },
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label])) as Record<
  HelpCategory,
  string
>;

/** "App and website", "App", "Website". */
export function showsLabel(shows: string[]): string {
  const app = shows.includes('app');
  const web = shows.includes('web');
  return app && web ? 'App and website' : app ? 'App' : 'Website';
}

export const dayMonth = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });

/** "how-credits-work" from a title. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, '<a href="$2">$1</a>');
}

/**
 * Article bodies are stored as a small Markdown subset the app also renders: paragraphs, "### "
 * headings, "- " lists, **bold** and [links](https://…). Never raw HTML.
 */
export function bodyToHtml(md: string): string {
  return md
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (block.startsWith('### ')) return `<h3>${inline(block.slice(4))}</h3>`;
      const lines = block.split('\n');
      if (lines.every((l) => /^[-*] /.test(l)))
        return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
      return `<p>${inline(lines.join(' '))}</p>`;
    })
    .join('');
}

function inlineFromNode(n: Node): string {
  if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? '').replace(/\s+/g, ' ');
  if (!(n instanceof HTMLElement)) return '';
  const inner = Array.from(n.childNodes).map(inlineFromNode).join('');
  const tag = n.tagName;
  if (tag === 'BR') return ' ';
  if ((tag === 'B' || tag === 'STRONG') && inner.trim()) return `**${inner.trim()}**`;
  if (tag === 'A') {
    const href = n.getAttribute('href') ?? '';
    return /^(https?:\/\/|\/)/.test(href) && inner.trim() ? `[${inner.trim()}](${href})` : inner;
  }
  return inner;
}

/** The editor's DOM back to the Markdown subset (whatever the browser inserted). */
export function htmlToBody(root: HTMLElement): string {
  const blocks: string[] = [];
  let loose = '';
  const flush = () => {
    if (loose.trim()) blocks.push(loose.trim());
    loose = '';
  };
  for (const n of Array.from(root.childNodes)) {
    const tag = n instanceof HTMLElement ? n.tagName : '';
    if (/^H[1-6]$/.test(tag)) {
      flush();
      const t = inlineFromNode(n).trim();
      if (t) blocks.push(`### ${t}`);
    } else if (tag === 'UL' || tag === 'OL') {
      flush();
      const items = Array.from((n as HTMLElement).querySelectorAll(':scope > li'))
        .map((li) => inlineFromNode(li).trim())
        .filter(Boolean);
      if (items.length) blocks.push(items.map((i) => `- ${i}`).join('\n'));
    } else if (tag === 'P' || tag === 'DIV') {
      flush();
      const t = inlineFromNode(n).trim();
      if (t) blocks.push(t);
    } else {
      loose += inlineFromNode(n);
    }
  }
  flush();
  return blocks.join('\n\n');
}

/** First paragraph, for the preview. */
export const firstParagraph = (md: string) =>
  (md.split(/\n{2,}/).find((b) => b.trim() && !b.startsWith('### ') && !/^[-*] /.test(b)) ?? '').replace(
    /\*\*|\[|\]\([^)]*\)/g,
    '',
  );
