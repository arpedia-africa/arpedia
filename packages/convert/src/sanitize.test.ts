import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { UnsafeArchiveError, imageType, safeUnzip, sanitizeHtml } from './sanitize';

const images = (src: string) => (src === 'images/a.png' ? 'img/a.png' : null);

describe('sanitizeHtml', () => {
  it('strips scripts, handlers, styles, frames, forms and remote resources', () => {
    const { html, report } = sanitizeHtml(
      `<html><head><title>x</title><link rel="stylesheet" href="https://evil/x.css"></head><body>
       <p onclick="steal()" style="color:red" id="p_abcdefghij">Hi <script>alert(1)</script><b>there</b></p>
       <img src="https://evil.example/t.png"><img src="data:image/png;base64,AAAA"><img src="//evil/x.png">
       <img src="../../etc/passwd"><img src="images/a.png" onerror="x()" alt="Map">
       <iframe src="https://evil"></iframe><form action="/x"><input name="q"></form>
       <a href="https://evil.example">site</a> <a href="#n1" onmouseover="x">note</a>
       <a href="javascript:alert(1)">js</a>
       <div class="scene-break evil"></div><svg><script>x</script></svg><!-- comment -->
       <h5>Deep heading</h5><section><p>kept</p></section></body></html>`,
      { image: images },
    );
    expect(html).not.toMatch(
      /script|onclick|onerror|onmouseover|style|iframe|form|input|svg|evil|javascript|data:|passwd|comment/,
    );
    expect(html).toContain('<p id="p_abcdefghij">Hi <b>there</b></p>');
    expect(html).toContain('<img src="img/a.png" alt="Map"/>');
    expect(html).toContain('<a href="#n1">note</a>');
    expect(html).toContain('site');
    expect(html).toContain('<div class="scene-break"></div>');
    expect(html).toContain('<h3>Deep heading</h3>');
    expect(html).toContain('<p>kept</p>');
    expect(report.external).toBe(6); // 4 images (remote, data, //, ../) + 2 links (https, javascript:)
    expect(report.dropped).toBe(5); // head, script, iframe, form, svg
    expect(report.attributes).toBeGreaterThanOrEqual(4);
  });
  it('escapes text and keeps only well-formed ids', () => {
    const { html } = sanitizeHtml('<p id="1bad" title="t">a &lt;b&gt; &amp; "c"</p><p id="ok-1">x</p>');
    expect(html).toBe('<p>a &lt;b&gt; &amp; "c"</p><p id="ok-1">x</p>');
  });
});

describe('imageType', () => {
  it('checks magic bytes, not names', () => {
    expect(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(imageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe('png');
    expect(imageType(strToU8('GIF89a'))).toBe('gif');
    expect(imageType(strToU8('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
    expect(imageType(strToU8('<svg onload=x>'))).toBeNull();
  });
});

describe('safeUnzip', () => {
  const reason = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return e instanceof UnsafeArchiveError ? e.reason : String(e);
    }
    return 'ok';
  };
  it('unpacks a normal package', () => {
    const files = safeUnzip(
      zipSync({ 'OEBPS/ch1.xhtml': strToU8('<p>a</p>'), mimetype: strToU8('application/epub+zip') }),
    );
    expect(Object.keys(files).sort()).toEqual(['OEBPS/ch1.xhtml', 'mimetype']);
  });
  it('refuses zip-slip paths', () => {
    expect(reason(() => safeUnzip(zipSync({ '../evil.sh': strToU8('x') })))).toBe('path');
    expect(reason(() => safeUnzip(zipSync({ 'OEBPS/../../evil': strToU8('x') })))).toBe('path');
    expect(reason(() => safeUnzip(zipSync({ '/etc/cron.d/x': strToU8('x') })))).toBe('path');
  });
  it('refuses nested archives, by name or by content', () => {
    const inner = zipSync({ 'a.txt': strToU8('x') });
    expect(reason(() => safeUnzip(zipSync({ 'images/inner.zip': inner })))).toBe('nested');
    expect(reason(() => safeUnzip(zipSync({ 'images/cover.png': inner }, { level: 0 })))).toBe('nested');
  });
  it('refuses more than 5,000 entries', () => {
    const many: Record<string, Uint8Array> = {};
    for (let i = 0; i <= 5_000; i++) many[`f${i}.txt`] = new Uint8Array(0);
    expect(reason(() => safeUnzip(zipSync(many)))).toBe('too_many_entries');
  });
});
