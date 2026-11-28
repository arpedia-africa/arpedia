import type { ReadingManifest } from '@arpedia/core';
import { describe, expect, it } from 'vitest';
import { FRAME_SRC, answer, frameHtml, type SpotOpen } from './reader-host';

const manifest: ReadingManifest = {
  book_id: 'b',
  revision_id: 'r',
  total_words: 300,
  preview_cut: { chapter_uid: 'u1', para_id: 'p1' },
  chapters: [0, 1, 2].map((ord) => ({
    chapter_uid: `u${ord}`,
    ord,
    title: `Chapter ${ord + 1}`,
    kind: 'chapter' as const,
    words: 100,
    words_before: ord * 100,
    pages: 0.4,
    price_credits: 1,
    paragraphs: [{ id: `p${ord}`, words_before: ord * 100 }],
  })),
};

const open = (access: SpotOpen['access']): SpotOpen => ({
  book: {
    manifest,
    files: {
      'content.opf': '<package/>',
      'c0.full.xhtml': 'zero',
      'c1.full.xhtml': 'one — all',
      'c1.free.xhtml': 'one — free',
      'c2.full.xhtml': 'two',
    },
    freeFiles: { 'c1.full.xhtml': 'c1.free.xhtml' },
    images: { 'img/c0-1.png': 'iVBORw0K' },
  },
  access,
  para_id: 'p0',
  gateRoom: 0,
});

const text = (r: { bytes_b64?: string }) =>
  new TextDecoder().decode(Uint8Array.from(atob(r.bytes_b64!), (c) => c.charCodeAt(0)));

describe('reader host', () => {
  it('serves every chapter in full when the phone opens everything', () => {
    const o = open({ u0: 'open', u1: 'open', u2: 'open' });
    expect(text(answer(o, 'c1.full.xhtml'))).toBe('one — all');
    expect(text(answer(o, 'c2.full.xhtml'))).toBe('two');
    expect(text(answer(o, 'content.opf'))).toBe('<package/>');
  });

  it('stops at the cut like a reader with no plan: free file, then nothing', () => {
    const o = open({ u0: 'open', u1: 'partial', u2: 'locked' });
    expect(text(answer(o, 'c1.full.xhtml'))).toBe('one — free');
    expect(answer(o, 'c2.full.xhtml')).toEqual({ error: 'missing' });
  });

  it('serves images, a blank one when it could not be loaded, and nothing for unknown files', () => {
    const o = open({ u0: 'open', u1: 'open', u2: 'open' });
    expect(answer(o, 'img/c0-1.png')).toEqual({ bytes_b64: 'iVBORw0K' });
    expect(answer(o, 'img/c1-1.png').bytes_b64).toMatch(/^R0lGOD/);
    expect(answer(o, 'META-INF/encryption.xml')).toEqual({ error: 'missing' });
  });

  it('runs the bundle outside the console origin, with a bridge to the page', () => {
    expect(FRAME_SRC.startsWith('data:text/html')).toBe(true);
    const html = frameHtml('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    expect(html).toContain('<head><script>window.ReactNativeWebView={postMessage:');
    expect(html).toContain('parent.postMessage(s,"*")');
  });
});
