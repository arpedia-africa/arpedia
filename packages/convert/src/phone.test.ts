import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { docxToHtml } from './docx';
import { writeEpub } from './epub-write';
import { convertForUpload, PHONE_WORD_CAP } from './phone';

const png = () => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, 400);
  new DataView(b.buffer).setUint32(20, 300);
  return b;
};

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');
const p = (text: string, ppr = '', rpr = '') =>
  `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const h = (text: string, style = 'Heading1') => p(text, `<w:pStyle w:val="${style}"/>`);
const blank = '<w:p/>';

const STYLES = `<w:styles ${W}>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
  <w:style w:type="paragraph" w:styleId="MyChapter"><w:name w:val="My chapter"/><w:basedOn w:val="Heading1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
  <w:style w:type="character" w:styleId="Strong"><w:name w:val="Strong"/></w:style>
</w:styles>`;

function docx(body: string, extra: Record<string, Uint8Array> = {}) {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(
      `<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`,
    ),
    'word/styles.xml': strToU8(STYLES),
    'word/_rels/document.xml.rels': strToU8(
      '<Relationships><Relationship Id="rId5" Target="media/image1.png"/>' +
        '<Relationship Id="rId9" Target="http://example.com/x.png" TargetMode="External"/></Relationships>',
    ),
    ...extra,
  });
}

describe('docxToHtml', () => {
  it('maps heading styles (through basedOn), keeps Title as a paragraph, bold and italic', () => {
    const { html } = docxToHtml(
      docx(
        p('My Book', '<w:pStyle w:val="Title"/>') +
          h('Chapter One') +
          `<w:p><w:r><w:t>Plain </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r>` +
          `<w:r><w:rPr><w:b/></w:rPr><w:t> more</w:t></w:r><w:r><w:rPr><w:i w:val="0"/></w:rPr><w:t> not italic</w:t></w:r>` +
          `<w:r><w:rPr><w:rStyle w:val="Strong"/></w:rPr><w:t> strong</w:t></w:r></w:p>` +
          h('A scene', 'Heading2') +
          h('Chapter Two', 'MyChapter'),
      ),
    );
    expect(html).toBe(
      '<p>My Book</p><h1>Chapter One</h1>' +
        '<p>Plain <strong>bold more</strong> not italic<strong> strong</strong></p>' +
        '<h2>A scene</h2><h1>Chapter Two</h1>',
    );
  });

  it('drops blank paragraphs, makes a long blank run a scene break, keeps line breaks and centring', () => {
    const { html } = docxToHtml(
      docx(
        p('One') +
          blank +
          p('Two') +
          blank.repeat(3) +
          p('Three', '<w:jc w:val="center"/>') +
          `<w:p><w:r><w:t>Line</w:t><w:br/><w:t>next</w:t><w:br w:type="page"/></w:r></w:p>`,
      ),
    );
    expect(html).toBe(
      '<p>One</p><p>Two</p><div class="scene-break"></div><p class="centered">Three</p><p>Line<br/>next</p>',
    );
  });

  it('skips deleted text, field codes and text boxes, and escapes markup in text', () => {
    const { html } = docxToHtml(
      docx(
        `<w:p><w:r><w:t>a &lt;b&gt; &amp; c</w:t></w:r><w:del><w:r><w:delText>gone</w:delText></w:r></w:del>` +
          `<w:r><w:instrText>PAGE</w:instrText></w:r>` +
          `<w:r><w:drawing><w:txbxContent><w:p><w:r><w:t>box</w:t></w:r></w:p></w:txbxContent></w:drawing></w:r></w:p>`,
      ),
    );
    expect(html).toBe('<p>a &lt;b&gt; &amp; c</p>');
  });

  it('extracts embedded images by magic bytes and drops external ones', () => {
    const got = docxToHtml(
      docx(
        `<w:p><w:r><w:drawing><a:blip xmlns:a="x" r:embed="rId5" xmlns:r="y"/></w:drawing></w:r></w:p>` +
          `<w:p><w:r><w:drawing><a:blip xmlns:a="x" r:embed="rId9" xmlns:r="y"/></w:drawing></w:r></w:p>`,
        { 'word/media/image1.png': png() },
      ),
    );
    expect(got.html).toBe('<p><img src="img/1.png" alt=""/></p>');
    expect(Object.keys(got.images)).toEqual(['img/1.png']);
  });

  it('rejects files that are not Word documents', () => {
    expect(() => docxToHtml(strToU8('not a zip'))).toThrow();
    expect(() => docxToHtml(zipSync({ 'a.txt': strToU8('x') }))).toThrow(/document.xml/);
  });
});

describe('convertForUpload', () => {
  const meta = { title: 'Ada', identifier: 'urn:uuid:00000000-0000-0000-0000-000000000001' };

  it('converts Word to an EPUB3 with hints the Worker would agree with', async () => {
    const body = h('Chapter 1') + p(words(1500)) + h('Chapter 2') + p(`"Hi," she said -- ${words(997)}`);
    const stages: number[] = [];
    const got = await convertForUpload(docx(body), 'docx', meta, (s) => stages.push(s));
    expect(stages).toEqual([0, 1, 2, 3]);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.hints).toMatchObject({ words: 2500, pages: 10, price: 5, chapters: 2 });
    const files = unzipSync(got.epub);
    expect(Object.keys(files)[0]).toBe('mimetype');
    const c2 = new TextDecoder().decode(files['OEBPS/c002.xhtml']);
    expect(c2).toContain('<h1>Chapter 2</h1>');
    expect(c2).toContain('“Hi,” she said —');
  });

  it('rewrites an EPUB through the normaliser, one heading per chapter', async () => {
    const src = writeEpub({
      title: 'Ada',
      language: 'en',
      identifier: meta.identifier,
      html: `<h1>One</h1><p>${words(1200)}</p><p>* * *</p><p>"${words(10)}"</p><h1>Two</h1><p>${words(800)}</p>`,
    });
    const got = await convertForUpload(src, 'epub', meta);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.hints.chapters).toBe(2);
    expect(got.hints.words).toBe(2010);
    const c1 = new TextDecoder().decode(unzipSync(got.epub)['OEBPS/c001.xhtml']);
    expect(c1).toContain('<div class="scene-break"></div>');
    expect(c1).toContain('“word');
  });

  it('falls back to the desk for books over the cap and for unreadable files', async () => {
    const big = docx(h('Chapter 1') + p(words(PHONE_WORD_CAP + 1)));
    await expect(convertForUpload(big, 'docx', meta)).resolves.toMatchObject({
      ok: false,
      reason: 'too_large',
    });
    await expect(convertForUpload(strToU8('nope'), 'docx', meta)).resolves.toMatchObject({
      ok: false,
      reason: 'conversion_failed',
    });
    await expect(convertForUpload(strToU8('nope'), 'epub', meta)).resolves.toMatchObject({
      ok: false,
      reason: 'conversion_failed',
    });
    await expect(convertForUpload(docx(blank + blank), 'docx', meta)).resolves.toMatchObject({
      ok: false,
      reason: 'conversion_failed',
    });
  });
});
