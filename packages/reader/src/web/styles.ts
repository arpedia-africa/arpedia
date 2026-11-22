// Book page styles inside foliate's section iframes (prototype .page, .chap-h, flow 04 rule 63).
// Paragraph ids and element order never change: only attributes and these styles do, so CFIs hold.
import { READER_THEMES, type ReaderSettings } from '../protocol';

const FAMILIES: Record<ReaderSettings['font'], string> = {
  literata: "'Literata', Georgia, serif",
  inter: "'Inter', system-ui, sans-serif",
  serif: "'Gelasio', 'Literata', Georgia, serif",
  atkinson: "'Atkinson Hyperlegible', 'Inter', sans-serif",
};

export const UI_FONT = "'Inter', system-ui, sans-serif";
export const DISPLAY_FONT = "'Bricolage Grotesque', 'Inter', sans-serif";

/** Orange label colours: --org-ink on light pages, the prototype's #F5B36A on dark. */
export const labelInk = (s: ReaderSettings) => (s.theme === 'dark' ? '#F5B36A' : '#9A4F00');

export function bookCss(s: ReaderSettings): string {
  const t = READER_THEMES[s.theme];
  // The prototype draws 17 px with line-height 1.72 at "Normal"; scale its spacing with the setting.
  const lh = (s.line_spacing / 1.6) * 1.72;
  return `
html{color-scheme:${s.theme === 'dark' ? 'dark' : 'light'};-webkit-text-size-adjust:none}
html,body{background:${t.page}!important;color:${t.text}!important}
body{font-family:${FAMILIES[s.font]};font-size:${s.font_size}px;line-height:${lh.toFixed(3)};
  -webkit-touch-callout:none;-webkit-user-select:text;user-select:text;overflow-wrap:break-word;hyphens:auto}
p{margin:0 0 ${Math.round((12 / 17) * s.font_size)}px;text-indent:1.4em;text-wrap:pretty;orphans:2;widows:2}
h1+p,h2+p,h3+p,.scene-break+p,figure+p{text-indent:0}
h1{font-family:${DISPLAY_FONT};font-weight:800;font-size:${Math.round((26 / 17) * s.font_size)}px;letter-spacing:-0.02em;
  line-height:1.05;margin:0 0 16px;text-indent:0;color:inherit}
h1[data-arp-label]::before{content:attr(data-arp-label);display:block;font-family:${UI_FONT};font-size:11px;font-weight:700;
  color:${labelInk(s)};letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px;line-height:1.4}
a{color:inherit}
img,figure{-webkit-user-select:none;user-select:none}
::selection{background:rgba(245,147,31,.32)}
[data-arp-gate]{display:block;break-inside:avoid;-webkit-user-select:none;user-select:none}
`;
}
