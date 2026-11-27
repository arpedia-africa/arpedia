'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { AGES, Drop, LANGUAGES, put } from '../../new/client';
import { finishEdit, startEdit } from './actions';
import { changes, type Current } from './changes';

/**
 * Edit details or Replace cover, as a modal over the book's Details tab. Saving makes revision
 * n + 1 from the live one (same text and prices) and sends it to Ready for review, where another
 * Publisher publishes it; readers keep the live revision until then.
 */
export function EditBookModal({
  bookId,
  mode,
  liveNo,
  openNo,
  genres,
  current,
}: {
  bookId: string;
  mode: 'details' | 'cover';
  liveNo: number;
  openNo: number | null;
  genres: string[];
  current: Current;
}) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<Current>(current);
  const [cover, setCover] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [genreOpen, setGenreOpen] = useState(false);
  // A started cover edit whose upload link is still valid, so a retry doesn't start another.
  const started = useRef<{ revision_id: string; upload: string } | null>(null);
  const closeHref = `/books/${bookId}`;
  const COVER_MAX = 10 * 1024 * 1024;
  const next = liveNo + 1;
  const set = <K extends keyof Current>(k: K, v: Current[K]) => setForm(f => ({ ...f, [k]: v }));

  const pickCover = (f: File) => {
    if (!/^image\/(jpeg|png)$/.test(f.type)) return show('Choose a JPG or PNG cover.');
    if (f.size > COVER_MAX) return show('That cover is over 10 MB. Send a smaller one.');
    setCover(f);
  };

  const save = () => {
    if (openNo !== null) return show(`Revision ${openNo} is still in the pipeline. Publish or send it back first.`);
    const meta = mode === 'details' ? changes(current, form) : {};
    if (mode === 'details' && !form.title.trim()) return show('Add the book title.');
    if (mode === 'details' && Object.keys(meta).length === 0) return show('Nothing changed yet.');
    if (mode === 'cover' && !cover) return show('Choose the new cover first.');
    start(async () => {
      let s = started.current;
      if (!s) {
        const r = await startEdit(bookId, meta, mode === 'cover', note);
        if (!r.ok) return show(r.error);
        if (!r.data.upload) return router.push(`/books/${bookId}/revisions`);
        s = started.current = { revision_id: r.data.revision_id, upload: r.data.upload };
      }
      if (!(await put(s.upload, cover!))) {
        started.current = null;
        return show("The cover didn't upload. Check your connection and press Save again.");
      }
      const f = await finishEdit(bookId, s.revision_id);
      started.current = null;
      if (!f.ok) return show(f.error);
      router.push(`/books/${bookId}/revisions`);
    });
  };

  const title = mode === 'cover' ? 'Replace cover' : 'Edit details';
  return (
    <section className="screen overlay enter">
      <Link className="backdrop" href={closeHref} aria-label="Close"></Link>
      <div className="modal" role="dialog" aria-label={title}>
        <div className="modal__h">
          <div className="grow">
            <h2>{title}</h2>
            <p>{`Saved as revision ${next}. Readers keep revision ${liveNo} until another Publisher publishes it.`}</p>
          </div>
          <Link className="ib" href={closeHref} aria-label="Close">
            <Icon name="x" />
          </Link>
        </div>
        <div className="modal__b">
          {openNo !== null && (
            <div className="note warn" role="alert">
              <span className="grow">
                <b>{`Revision ${openNo} is still in the pipeline`}</b>
                <span>Publish or send it back before you edit the book here.</span>
              </span>
            </div>
          )}
          {mode === 'details' ? (
            <div className="fgrid">
              <div className="f full">
                <label htmlFor="ed-title">Title</label>
                <div className="inp">
                  <input
                    id="ed-title"
                    value={form.title}
                    maxLength={200}
                    aria-label="Title"
                    onChange={e => set('title', e.target.value)}
                  />
                </div>
              </div>
              <div className="f full">
                <label htmlFor="ed-subtitle">Subtitle</label>
                <div className="inp">
                  <input
                    id="ed-subtitle"
                    value={form.subtitle}
                    maxLength={200}
                    aria-label="Subtitle"
                    onChange={e => set('subtitle', e.target.value)}
                  />
                </div>
              </div>
              <div className="f full">
                <label htmlFor="ed-desc">Description</label>
                <textarea
                  id="ed-desc"
                  className="inp ta"
                  rows={4}
                  maxLength={600}
                  aria-label="Description"
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                ></textarea>
                <span className="hint">Up to 600 characters</span>
              </div>
              <div className="f full">
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
                    <span>{form.genres.length ? form.genres.join(', ') : 'Up to 3'}</span>
                    <Icon name="chevd" size="s" />
                  </div>
                  {genreOpen && (
                    <div className="menu" style={{ left: 0, right: 'auto' }}>
                      {genres.map(g => (
                        <a
                          key={g}
                          role="menuitemcheckbox"
                          aria-checked={form.genres.includes(g)}
                          onClick={() =>
                            set(
                              'genres',
                              form.genres.includes(g)
                                ? form.genres.filter(x => x !== g)
                                : form.genres.length < 3
                                  ? [...form.genres, g]
                                  : form.genres,
                            )
                          }
                        >
                          {form.genres.includes(g) ? <b>{g}</b> : g}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="f">
                <label htmlFor="ed-lang">Language</label>
                <div className="inp sel">
                  <select
                    id="ed-lang"
                    value={form.language}
                    style={{ appearance: 'none' }}
                    onChange={e => set('language', e.target.value)}
                  >
                    {[
                      ...LANGUAGES,
                      ...(LANGUAGES.some(([v]) => v === form.language) ? [] : [[form.language, form.language] as const]),
                    ].map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <Icon name="chevd" size="s" />
                </div>
              </div>
              <div className="f">
                <label htmlFor="ed-age">Age rating</label>
                <div className="inp sel">
                  <select id="ed-age" value={form.age} style={{ appearance: 'none' }} onChange={e => set('age', e.target.value)}>
                    {[...new Set([...AGES, form.age])].map(a => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                  <Icon name="chevd" size="s" />
                </div>
              </div>
            </div>
          ) : (
            <Drop
              title="New cover"
              hint="JPG or PNG, at least 1600 × 2560"
              accept="image/jpeg,image/png"
              file={cover}
              onFile={pickCover}
              button="Choose cover"
              style={{ padding: 16 }}
            />
          )}
          <div className="f">
            <label htmlFor="ed-note">Note for the audit log</label>
            <div className="inp">
              <input
                id="ed-note"
                value={note}
                maxLength={500}
                aria-label="Note for the audit log"
                placeholder="Optional, for example: author asked for a new subtitle"
                onChange={e => setNote(e.target.value)}
              />
            </div>
            <span className="hint">The text and prices stay the same; the change goes to Ready for review.</span>
          </div>
        </div>
        <div className="modal__f">
          <Link className="btn btn-g" href={closeHref}>
            Cancel
          </Link>
          <button className="btn btn-p" type="button" disabled={pending || openNo !== null} onClick={save}>
            {pending ? 'Saving…' : `Save as revision ${next}`}
          </button>
        </div>
      </div>
      {toast}
    </section>
  );
}
