#!/usr/bin/env node
// Print prototype screens by id, compactly, so build sessions read only what they need.
// Usage:
//   node tools/screen.mjs s-book s-unlock          app screens (prototype/src)
//   node tools/screen.mjs --admin books book-preview   admin screens (admin/src, ids without "s-")
//   node tools/screen.mjs --list 3                 list app screens in flow 3
//   node tools/screen.mjs --admin --list 3         list admin screens in area 3
//   add --css to also print the <style> rules whose selectors appear in the screen
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const admin = args.includes('--admin');
const withCss = args.includes('--css');
const listIdx = args.indexOf('--list');
const ids = args.filter((a, i) => !a.startsWith('--') && !(listIdx !== -1 && i === listIdx + 1));
const dir = join(root, admin ? 'admin/src' : 'prototype/src');
const src = readdirSync(dir).filter(f => f.endsWith('.html')).sort()
  .map(f => readFileSync(join(dir, f), 'utf8')).join('\n');

const sectionRe = /<section\b[^>]*\bid="([^"]+)"[^>]*>[\s\S]*?<\/section>/g;
const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1] || '';
const sections = [...src.matchAll(sectionRe)].map(m => ({ id: m[1], html: m[0], open: m[0].slice(0, m[0].indexOf('>') + 1) }));

const compact = html => html
  .replace(/<svg\b[^>]*>\s*<use href="#([^"]+)"\s*\/>\s*<\/svg>/g, '[icon:$1]')
  .replace(/<svg\b[\s\S]*?<\/svg>/g, '[svg]')
  .replace(/\sstyle="[^"]*"/g, '')
  .replace(/\sdata-note="[^"]*"/g, '')
  .replace(/\saria-hidden="true"/g, '')
  .replace(/\n\s*\n/g, '\n')
  .replace(/[ \t]{2,}/g, ' ');

if (listIdx !== -1) {
  const n = args[listIdx + 1];
  const key = admin ? 'data-area' : 'data-flow';
  for (const s of sections) if (attr(s.open, key) === n) console.log(`${s.id}\t${attr(s.open, 'data-name')}`);
  process.exit(0);
}

const want = ids.map(id => admin && !id.startsWith('s-') ? `s-${id}` : id);
let css = '';
if (withCss) css = [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');

for (const id of want) {
  const s = sections.find(x => x.id === id);
  if (!s) { console.log(`## ${id}\n(not found)\n`); continue; }
  const note = attr(s.open, 'data-note').split('|').map(n => `- ${n}`).join('\n');
  console.log(`## ${id} · ${attr(s.open, 'data-name')}\n${note}\n\n${compact(s.html)}\n`);
  if (withCss) {
    const classes = new Set([...s.html.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)));
    const rules = css.split('}').filter(r => [...classes].some(c => c && r.includes('.' + c + '{') || r.includes('.' + c + ' ') || r.includes('.' + c + ',') || r.includes('.' + c + ':')));
    if (rules.length) console.log('```css\n' + rules.map(r => r.trim() + '}').join('\n') + '\n```\n');
  }
}
