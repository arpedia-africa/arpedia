'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { watTime } from '../../reports/labels';
import { publishHelp, saveHelpDraft, setRelated } from '../actions';
import {
  bodyToHtml,
  CATEGORIES,
  CATEGORY_LABEL,
  dayMonth,
  firstParagraph,
  htmlToBody,
  slugify,
  type HelpCategory,
} from '../labels';

interface Version {
  id: string;
  number: number;
  title: string;
  body: string;
  edited_by: string | null;
  created_at: string;
  current: boolean;
}

export interface HelpArticle {
  article: {
    id: string;
    slug: string;
    category: HelpCategory;
    shows_in: string[];
    state: 'draft' | 'published';
    related: string[];
    in_search: boolean;
    current_version_id: string | null;
  };
  versions: Version[];
}

const num = (n: number) => n.toLocaleString('en-NG');
// A native select inside the prototype's `.inp.sel` box, so it keeps the chevd icon.
const SELECT: React.CSSProperties = {
  appearance: 'none',
  border: 0,
  background: 'transparent',
  font: 'inherit',
  color: 'inherit',
  width: '100%',
  outline: 0,
};
const WEB = 'arpedia.africa';

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`switch${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
    />
  );
}

/** s-help-article. Save draft keeps edits out of the app; Publish makes the latest version live. */
export function HelpEditor({
  article,
  failed,
  others,
  stats,
}: {
  article: HelpArticle | null;
  failed: boolean;
  others: { id: string; title: string; category: HelpCategory }[];
  stats: { views: number; helpful: number | null } | null;
}) {
  const router = useRouter();
  const [toastNode, showToast] = useToast();
  const [pending, start] = useTransition();
  const a = article?.article ?? null;
  const versions = article?.versions ?? [];
  const latest = versions[0] ?? null;
  const live = versions.find((v) => v.current) ?? null;
  const [title, setTitle] = useState(latest?.title ?? '');
  const [category, setCategory] = useState<HelpCategory>(a?.category ?? 'getting_started');
  const [app, setApp] = useState(a ? a.shows_in.includes('app') : true);
  const [web, setWeb] = useState(a ? a.shows_in.includes('web') : true);
  const [inSearch, setInSearch] = useState(a?.in_search ?? true);
  const [related, setRel] = useState<string[]>(a?.related ?? []);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState(false);
  const [preview, setPreview] = useState<'app' | 'web'>('app');
  const [body, setBody] = useState(latest?.body ?? '');
  const [dirty, setDirty] = useState(false);
  const editor = useRef<HTMLDivElement>(null);
  const fold = useRef<HTMLDetailsElement>(null);
  const slug = a?.slug ?? slugify(title);
  const draftAhead = !!latest && (!live || latest.number > live.number);

  if (failed) {
    return (
      <section className="screen enter">
        <div className="page">
          <div className="panel">
            <div className="empty">
              <b>This article didn&apos;t load</b>
              <span>Check your connection and refresh the page.</span>
              <div className="row">
                <a className="btn btn-g" href="/help">
                  Back to help articles
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const readBody = () => (editor.current ? htmlToBody(editor.current) : body);
  const save = async (): Promise<string | null> => {
    const text = readBody();
    if (!title.trim()) return (showToast('Add a title first.'), null);
    if (!text.trim()) return (showToast('Write the article first.'), null);
    if (!app && !web) return (showToast('Show it in the app, on the website, or both.'), null);
    const res = await saveHelpDraft({
      articleId: a?.id ?? null,
      slug,
      category,
      showsIn: [app && 'app', web && 'web'].filter(Boolean) as string[],
      title: title.trim(),
      body: text,
      inSearch,
    });
    if (res.error) return (showToast(res.error), null);
    setBody(text);
    setDirty(false);
    return res.articleId ?? null;
  };

  const saveDraft = () =>
    start(async () => {
      const id = await save();
      if (!id) return;
      showToast('Draft saved');
      if (!a) router.replace(`/help/${id}`);
      else router.refresh();
    });

  const publish = () =>
    start(async () => {
      const id = dirty || !a || !latest ? await save() : a.id;
      if (!id) return;
      const res = await publishHelp(id);
      if (res.error) return showToast(res.error);
      showToast('Published. Live in the app and on the website within a minute.');
      router.push('/help');
    });

  const restore = () => {
    setMenu(false);
    const prev = versions.find((v) => live && v.number < live.number) ?? versions[1];
    if (!prev || !a) return showToast('There is no earlier version to restore.');
    start(async () => {
      const res = await saveHelpDraft({
        articleId: a.id,
        slug: a.slug,
        category,
        showsIn: [app && 'app', web && 'web'].filter(Boolean) as string[],
        title: prev.title,
        body: prev.body,
        inSearch,
      });
      if (res.error) return showToast(res.error);
      showToast(`Version ${prev.number} restored as a draft`);
      router.refresh();
    });
  };

  const changeRelated = (next: string[], msg: string) => {
    const before = related;
    setRel(next);
    if (!a) return;
    start(async () => {
      const res = await setRelated(a.id, next);
      if (res.error) return (setRel(before), showToast(res.error));
      showToast(msg, () => {
        setRel(before);
        void setRelated(a.id, before);
      });
    });
  };

  const exec = (cmd: string, value?: string) => {
    editor.current?.focus();
    document.execCommand(cmd, false, value);
    setDirty(true);
  };
  const addLink = () => {
    const url = window.prompt('Link address (https://…)');
    if (url && /^https?:\/\/\S+$/.test(url.trim())) exec('createLink', url.trim());
    else if (url) showToast('Use a full web address starting with https://');
  };

  const status = !a
    ? 'New article'
    : a.state === 'published'
      ? draftAhead
        ? 'Published · draft changes not live'
        : 'Published'
      : 'Draft';
  const editedBy = latest
    ? `version ${latest.number}${latest.edited_by ? ` · edited by ${latest.edited_by}` : ''}, ${dayMonth(latest.created_at)}`
    : null;
  const titleOf = (id: string) => others.find((o) => o.id === id)?.title;
  const pText = firstParagraph(body);

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <a href="/help">Help articles</a>
          <Icon name="chev" />
          <span>{latest?.title ?? 'New article'}</span>
        </div>
        <div className="ph__row">
          <div className="ph__title">
            <h1>{title.trim() || 'New article'}</h1>
            <div className="ph__meta">
              <span>{editedBy ? `${status} · ${editedBy}` : status}</span>
              {stats ? (
                <span>{`${num(stats.views)} views · ${stats.helpful == null ? 'no votes yet' : `${stats.helpful}% helpful`}`}</span>
              ) : null}
            </div>
          </div>
          <div className="ph__acts">
            <button type="button" className="btn btn-g" disabled={pending} onClick={saveDraft}>
              Save draft
            </button>
            <button type="button" className="btn btn-p" disabled={pending} onClick={publish}>
              Publish
            </button>
            {a ? (
              <div className="mwrap">
                <button
                  type="button"
                  className="ib"
                  aria-expanded={menu}
                  aria-label="More actions"
                  onClick={() => setMenu((m) => !m)}
                >
                  <Icon name="more" />
                </button>
                {menu ? (
                  <div className="menu">
                    <a
                      href="#preview"
                      onClick={(e) => {
                        e.preventDefault();
                        setMenu(false);
                        setBody(readBody());
                        if (fold.current) {
                          fold.current.open = true;
                          fold.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }}
                    >
                      Preview
                    </a>
                    <a
                      href="#copy"
                      onClick={(e) => {
                        e.preventDefault();
                        setMenu(false);
                        void navigator.clipboard?.writeText(`https://${WEB}/help/${a.slug}`);
                        showToast(`Link copied: ${WEB}/help/${a.slug}`);
                      }}
                    >
                      Copy web link
                    </a>
                    <a href="#restore" onClick={(e) => (e.preventDefault(), restore())}>
                      Restore previous version
                    </a>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="page">
        <div className="split split--wide">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__body" style={{ paddingTop: 18 }}>
                <div className="fgrid">
                  <div className="f full">
                    <label htmlFor="ha-title">Title</label>
                    <div className="inp">
                      <input
                        id="ha-title"
                        maxLength={120}
                        value={title}
                        onChange={(e) => (setTitle(e.target.value), setDirty(true))}
                      />
                    </div>
                  </div>
                  <div className="f">
                    <label htmlFor="ha-cat">Category</label>
                    <div className="inp sel">
                      <select
                        id="ha-cat"
                        style={SELECT}
                        value={category}
                        onChange={(e) => (setCategory(e.target.value as HelpCategory), setDirty(true))}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <Icon name="chevd" />
                    </div>
                  </div>
                  <div className="f">
                    <label>Web address</label>
                    <div className="inp ro">
                      <span className="mono">{slug ? `/help/${slug}` : '/help/…'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="editor">
              <div className="editor__bar">
                <button
                  type="button"
                  className="ib sm"
                  aria-label="Bold"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => exec('bold')}
                >
                  <Icon name="aa" />
                </button>
                <button
                  type="button"
                  className="ib sm"
                  aria-label="List"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => exec('insertUnorderedList')}
                >
                  <Icon name="list" />
                </button>
                <button
                  type="button"
                  className="ib sm"
                  aria-label="Link"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={addLink}
                >
                  <Icon name="link" />
                </button>
                <button
                  type="button"
                  className="ib sm"
                  aria-label="Image"
                  onClick={() => showToast('Pictures in help articles come with the website help centre.')}
                >
                  <Icon name="image" />
                </button>
                <span className="sep"></span>
                <span className="faint" style={{ fontSize: 13 }}>
                  {dirty
                    ? 'Unsaved changes'
                    : latest
                      ? `Saved ${dayMonth(latest.created_at)}, ${watTime(latest.created_at)}`
                      : 'Not saved yet'}
                </span>
              </div>
              <div
                ref={editor}
                className="ts-help"
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                aria-label="Article"
                onInput={() => setDirty(true)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
                    e.preventDefault();
                    exec('bold');
                  }
                }}
                dangerouslySetInnerHTML={{ __html: bodyToHtml(latest?.body ?? '') || '<p><br></p>' }}
              />
            </div>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Shown where</h2>
              </div>
              <div className="list">
                <div className="setrow">
                  <span className="setrow__b">
                    <b>In-app Help</b>
                    <small>{`${CATEGORY_LABEL[category]} section`}</small>
                  </span>
                  <Switch on={app} label="In-app Help" onToggle={() => (setApp((v) => !v), setDirty(true))} />
                </div>
                <div className="setrow">
                  <span className="setrow__b">
                    <b>Website help centre</b>
                    <small>{`${WEB}/help`}</small>
                  </span>
                  <Switch
                    on={web}
                    label="Website help centre"
                    onToggle={() => (setWeb((v) => !v), setDirty(true))}
                  />
                </div>
                <div className="setrow">
                  <span className="setrow__b">
                    <b>Search suggestions</b>
                    <small>
                      {inSearch
                        ? 'Offered when readers search for its words'
                        : 'Only found by browsing its section'}
                    </small>
                  </span>
                  <Switch
                    on={inSearch}
                    label="Search suggestions"
                    onToggle={() => (setInSearch((v) => !v), setDirty(true))}
                  />
                </div>
              </div>
            </div>
            <details className="fold" ref={fold}>
              <summary>
                More details <small>related, preview, versions</small>
              </summary>
              <div className="fold__b">
                <b>Related articles</b>
                <div className="ts-chips">
                  {related.map((id) =>
                    titleOf(id) ? (
                      <button
                        key={id}
                        type="button"
                        className="ts-pill"
                        title="Remove"
                        onClick={() =>
                          changeRelated(
                            related.filter((x) => x !== id),
                            'Related article removed',
                          )
                        }
                      >
                        {titleOf(id)}
                      </button>
                    ) : null,
                  )}
                  {a ? (
                    adding ? (
                      <select
                        className="inp sel"
                        autoFocus
                        aria-label="Add a related article"
                        value=""
                        onBlur={() => setAdding(false)}
                        onChange={(e) => {
                          setAdding(false);
                          if (e.target.value)
                            changeRelated([...related, e.target.value], 'Related article added');
                        }}
                      >
                        <option value="">Pick an article</option>
                        {others
                          .filter((o) => !related.includes(o.id))
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.title}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <button type="button" className="fchip" onClick={() => setAdding(true)}>
                        + Add
                      </button>
                    )
                  ) : (
                    <span className="faint">Save the draft first to add related articles.</span>
                  )}
                </div>
                <b>Preview</b>
                <div className="seg">
                  <button
                    type="button"
                    className={preview === 'app' ? 'is-selected' : undefined}
                    onClick={() => setPreview('app')}
                  >
                    App
                  </button>
                  <button
                    type="button"
                    className={preview === 'web' ? 'is-selected' : undefined}
                    onClick={() => setPreview('web')}
                  >
                    Website
                  </button>
                </div>
                <div className="quote">
                  <b>{title.trim() || 'New article'}</b>
                  {preview === 'web' && slug ? (
                    <>
                      <br />
                      <small className="faint mono">{`${WEB}/help/${slug}`}</small>
                    </>
                  ) : null}
                  <br />
                  {pText || 'Write the article to see a preview.'}
                </div>
                <b>Version history</b>
                {versions.length ? (
                  <div className="tl">
                    {versions.map((v) => (
                      <div className={`tl__i${v.current ? ' ok' : ''}`} key={v.id}>
                        <b>{`Version ${v.number}${v.current ? ' · live' : live && v.number > live.number ? ' · draft' : ''}`}</b>
                        <small>{[dayMonth(v.created_at), v.edited_by].filter(Boolean).join(' · ')}</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No versions yet. Save draft makes version 1.</p>
                )}
              </div>
            </details>
          </div>
        </div>
      </div>
      {toastNode}
    </section>
  );
}
