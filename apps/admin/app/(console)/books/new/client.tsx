'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type CSSProperties } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { finishUpload, startUpload, type Started } from './actions';

export interface Author {
  id: string;
  name: string;
  handle: string;
  live: number;
  av: string;
}

const MB = 1024 * 1024;
const LIMITS = { docx: 50 * MB, epub: 50 * MB, pdf: 100 * MB, cover: 10 * MB };
const LANGUAGES = [
  ['en', 'English'],
  ['pcm', 'Nigerian Pidgin'],
  ['yo', 'Yoruba'],
  ['ig', 'Igbo'],
  ['ha', 'Hausa'],
] as const;
const AGES = ['Everyone', '13+', '16+', '18+'];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join('');
const sizeOf = (n: number) => (n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const typeOf = (f: File) => {
  const ext = f.name.toLowerCase().split('.').pop();
  return ext === 'docx' || ext === 'epub' || ext === 'pdf' ? ext : null;
};

async function sha256(f: File) {
  const d = await crypto.subtle.digest('SHA-256', await f.arrayBuffer());
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** PUT a file to a signed object URL (the Worker checks size and hash). */
async function put(url: string, f: File) {
  const res = await fetch(url, { method: 'PUT', body: f, headers: { 'X-Content-SHA256': await sha256(f) } }).catch(
    () => null,
  );
  return !!res?.ok;
}

/** A drop zone (`.drop`): drag a file in or choose one. */
function Drop({
  title,
  hint,
  accept,
  file,
  onFile,
  button,
  style,
}: {
  title: string;
  hint: string;
  accept: string;
  file: File | null;
  onFile: (f: File) => void;
  button: string;
  style?: CSSProperties;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className="drop"
      style={{ ...style, ...(over ? { borderColor: 'var(--org)' } : {}) }}
      onDragOver={e => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <b>{title}</b>
      <span>{file ? `${file.name} · ${sizeOf(file.size)}` : hint}</span>
      <button className="btn btn-g sm" type="button" onClick={() => input.current?.click()}>
        {file ? 'Choose another' : button}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** Upload a book (s-book-new, rule 51). */
export function NewBookForm({ q, authors, genres }: { q: string; authors: Author[]; genres: string[] }) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [search, setSearch] = useState(q);
  const [author, setAuthor] = useState<Author | null>(null);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [genreOpen, setGenreOpen] = useState(false);
  const [language, setLanguage] = useState('en');
  const [age, setAge] = useState('Everyone');
  // A started upload whose links are still valid, so a retry doesn't create a second book.
  const started = useRef<Started | null>(null);

  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => router.replace(`/books/new${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`, { scroll: false }), 250);
    return () => clearTimeout(t);
  }, [search, q, router]);

  const rows = author && !authors.some(a => a.id === author.id) ? [author, ...authors] : authors;
  const first = author?.name.split(' ')[0] ?? 'The author';

  const pickFile = (f: File) => {
    const t = typeOf(f);
    if (!t) return show('Choose a Word (.docx), EPUB or PDF file.');
    if (f.size > LIMITS[t]) return show(`That file is over ${LIMITS[t] / MB} MB. Send a smaller one.`);
    setFile(f);
  };
  const pickCover = (f: File) => {
    if (!/^image\/(jpeg|png)$/.test(f.type)) return show('Choose a JPG or PNG cover.');
    if (f.size > LIMITS.cover) return show('That cover is over 10 MB. Send a smaller one.');
    setCover(f);
  };

  const upload = () => {
    if (!author) return show('Pick the author first.');
    if (!title.trim()) return show('Add the book title.');
    if (!file) return show('Choose the manuscript file.');
    if (!cover) return show('Choose the cover image.');
    if (!rights) return show('Confirm the author holds the rights.');
    const sourceType = typeOf(file)!;
    start(async () => {
      let s = started.current;
      if (!s || new Date(s.expires_at).getTime() < Date.now() + 60_000) {
        const r = await startUpload({
          authorId: author.id,
          title,
          sourceType,
          subtitle,
          description,
          genres: picked,
          language,
          age,
        });
        if (!r.ok) return show(r.error);
        s = started.current = r.data;
      }
      const ok = await Promise.all([
        put(s.uploads.source, file),
        put(s.uploads.cover, cover),
        // An EPUB is already the book format, so it is also the converted package.
        sourceType === 'epub' && s.uploads.converted ? put(s.uploads.converted, file) : true,
      ]);
      if (ok.includes(false)) return show("The upload didn't finish. Check your connection and press Upload book again.");
      const f = await finishUpload(s.revision_id, sourceType === 'epub');
      if (!f.ok) return show(f.error);
      router.push(`/books/processing?added=${s.revision_id}`);
    });
  };

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <Link href="/books">Books</Link>
          <Icon name="chev" size="s" />
          <span>New book</span>
        </div>
        <div className="ph__row">
          <div className="ph__title">
            <h1>Upload a book</h1>
            <div className="ph__meta">
              <span>On behalf of an author, logged against your name</span>
            </div>
          </div>
          <div className="ph__acts">
            <Link className="btn btn-g" href="/books">
              Cancel
            </Link>
            <button className="btn btn-p" type="button" disabled={pending} onClick={upload}>
              {pending ? 'Uploading…' : 'Upload book'}
            </button>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="stack s20" style={{ maxWidth: 820 }}>
          <div className="panel">
            <div className="panel__head">
              <h2>Author</h2>
            </div>
            <div className="panel__body">
              <label className="search" style={{ maxWidth: 'none' }}>
                <Icon name="search" size="s" />
                <input
                  value={search}
                  placeholder="Name or username"
                  aria-label="Search authors"
                  onChange={e => setSearch(e.target.value)}
                />
              </label>
              <div className="panel panel--flush">
                {rows.length ? (
                  <div className="tw">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Author</th>
                          <th>Books</th>
                          <th className="r">Followers</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(a => (
                          <tr
                            key={a.id}
                            className={author?.id === a.id ? 'sel' : undefined}
                            tabIndex={0}
                            aria-selected={author?.id === a.id}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setAuthor(a)}
                            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setAuthor(a))}
                          >
                            <td>
                              <div className="who">
                                <span className={`av sm ${a.av}`}>{initials(a.name)}</span>
                                <span>
                                  <b>{a.name}</b>
                                  <small>{a.handle}</small>
                                </span>
                              </div>
                            </td>
                            <td>{a.live ? `${a.live} live` : 'None live'}</td>
                            {/* Follows arrive with flow 08. */}
                            <td className="n">—</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty">
                    <b>No authors match</b>
                    <span>Check the spelling. Only approved authors can have books.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="panel__head">
              <h2>Book</h2>
            </div>
            <div className="panel__body">
              <div className="fgrid">
                <div className="f full">
                  <label htmlFor="nb-title">Title</label>
                  <div className="inp">
                    <input
                      id="nb-title"
                      value={title}
                      maxLength={200}
                      aria-label="Title"
                      placeholder="Book title"
                      onChange={e => setTitle(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <Drop
                title="Drop the manuscript here"
                hint="Word (.docx) is best. EPUB is fine. PDF is slower and more likely to be sent back."
                accept=".docx,.epub,.pdf"
                file={file}
                onFile={pickFile}
                button="Choose file"
              />
              <Drop
                title="Cover image"
                hint="JPG or PNG, at least 1600 × 2560"
                accept="image/jpeg,image/png"
                file={cover}
                onFile={pickCover}
                button="Choose cover"
                style={{ padding: 16 }}
              />
              <label className="checkrow">
                <span
                  className={`cb${rights ? ' on' : ''}`}
                  role="checkbox"
                  aria-checked={rights}
                  tabIndex={0}
                  onClick={e => {
                    e.preventDefault();
                    setRights(v => !v);
                  }}
                  onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), setRights(v => !v))}
                ></span>
                <span onClick={() => setRights(v => !v)}>
                  The author told us they hold the rights to publish this book and accepted the publishing agreement.
                </span>
              </label>
            </div>
          </div>
          <details className="fold">
            <summary>
              More options <small>description, genres, subtitle, language, age rating</small>
            </summary>
            <div className="fold__b">
              <span className="hint">{`Optional. ${author ? first : 'The author'} can add the description and genres in Studio.`}</span>
              <div className="fgrid">
                <div className="f">
                  <label>Genres</label>
                  <div className="mwrap">
                    <div
                      className="inp sel"
                      role="button"
                      tabIndex={0}
                      aria-expanded={genreOpen}
                      onClick={() => setGenreOpen(o => !o)}
                      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setGenreOpen(o => !o))}
                    >
                      <span>{picked.length ? picked.join(', ') : 'Up to 3'}</span>
                      <Icon name="chevd" size="s" />
                    </div>
                    {genreOpen && (
                      <div className="menu" style={{ left: 0, right: 'auto' }}>
                        {genres.map(g => (
                          <a
                            key={g}
                            role="menuitemcheckbox"
                            aria-checked={picked.includes(g)}
                            onClick={() =>
                              setPicked(p =>
                                p.includes(g) ? p.filter(x => x !== g) : p.length < 3 ? [...p, g] : p,
                              )
                            }
                          >
                            {picked.includes(g) ? <b>{g}</b> : g}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="f">
                  <label htmlFor="nb-subtitle">Subtitle</label>
                  <div className="inp">
                    <input
                      id="nb-subtitle"
                      value={subtitle}
                      maxLength={200}
                      aria-label="Subtitle"
                      onChange={e => setSubtitle(e.target.value)}
                    />
                  </div>
                </div>
                <div className="f full">
                  <label htmlFor="nb-desc">Description</label>
                  <textarea
                    id="nb-desc"
                    className="inp ta"
                    rows={3}
                    maxLength={600}
                    aria-label="Description"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  ></textarea>
                  <span className="hint">Up to 600 characters</span>
                </div>
                <div className="f">
                  <label htmlFor="nb-lang">Language</label>
                  <div className="inp sel">
                    <select
                      id="nb-lang"
                      value={language}
                      style={{ appearance: 'none' }}
                      onChange={e => setLanguage(e.target.value)}
                    >
                      {LANGUAGES.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <Icon name="chevd" size="s" />
                  </div>
                </div>
                <div className="f">
                  <label htmlFor="nb-age">Age rating</label>
                  <div className="inp sel">
                    <select id="nb-age" value={age} style={{ appearance: 'none' }} onChange={e => setAge(e.target.value)}>
                      {AGES.map(a => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                    <Icon name="chevd" size="s" />
                  </div>
                </div>
              </div>
            </div>
          </details>
          <span className="hint">
            {`Next: the book is converted in 1 to 3 minutes, then ${author ? first : 'the author'} confirms chapters and previews in Studio.`}
          </span>
        </div>
      </div>
      {toast}
    </section>
  );
}
