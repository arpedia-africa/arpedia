'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Json } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { endBanner, saveBanner, type BannerFields } from './actions';
import {
  dayMonth,
  LIMIT_BODY,
  LIMIT_HEADLINE,
  PLACEMENT_LABEL,
  PRIORITIES,
  STATE_LABEL,
  type Banner,
  type BannerAudience,
  type BannerTarget,
  type Placement,
} from './labels';

interface Option {
  id: string;
  label: string;
}

const PLACEMENTS: { key: Placement; help: string }[] = [
  { key: 'home_top', help: 'Orange card above Continue reading. Up to 2 at once.' },
  { key: 'credits', help: 'A note above the top-ups. Good for offers.' },
  { key: 'launch_modal', help: 'Full-screen card when the app opens. Once per reader per day.' },
];
const SCREENS = [
  { key: 'home', label: 'Home' },
  { key: 'library', label: 'Library' },
  { key: 'credits', label: 'Credits' },
  { key: 'plans', label: 'Plans' },
  { key: 'discover', label: 'Discover' },
];

const TZ = 'Africa/Lagos';
/** `<input type="datetime-local">` value in WAT, and back to an ISO time. */
const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-CA', { timeZone: TZ })}T${d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}`;
};
const fromLocal = (v: string) => (v ? `${v}:00+01:00` : null);
const num = (n: number) => n.toLocaleString('en-NG');

function Counter({ n, max }: { n: number; max: number }) {
  return (
    <div className="sy-cnt" style={n > max - 8 ? { color: n > max ? 'var(--err-t)' : 'var(--warn-t)' } : undefined}>
      {`${n} of ${max} characters`}
    </div>
  );
}

function Radios<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { key: T; title: string; help: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="radios" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <div
          key={o.key}
          className={value === o.key ? 'radio is-selected' : 'radio'}
          role="radio"
          aria-checked={value === o.key}
          tabIndex={value === o.key ? 0 : -1}
          onClick={() => onChange(o.key)}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onChange(o.key))}
        >
          <span>
            <b>{o.title}</b>
            <small>{o.help}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

/** s-banner-edit: What it says, Who sees it, When, with the Home preview beside it. */
export function BannerEdit({
  banner,
  genres,
  books,
  authors,
}: {
  banner: Banner | null;
  genres: Option[];
  books: Option[];
  authors: Option[];
}) {
  const router = useRouter();
  const [placement, setPlacement] = useState<Placement>(banner?.placement ?? 'home_top');
  const [headline, setHeadline] = useState(banner?.headline ?? '');
  const [body, setBody] = useState(banner?.body ?? '');
  const [button, setButton] = useState(banner?.button_label ?? '');
  const [target, setTarget] = useState<BannerTarget | null>(banner?.target ?? null);
  const [image, setImage] = useState(banner?.image_url ?? '');
  const [audience, setAudience] = useState<BannerAudience>(banner?.audience ?? { kind: 'all' });
  const [genreId, setGenreId] = useState(banner?.audience.genre_id ?? genres[0]?.id ?? '');
  const [version, setVersion] = useState(banner?.audience.version ?? '');
  const [starts, setStarts] = useState(toLocal(banner?.starts_at ?? null));
  const [ends, setEnds] = useState(toLocal(banner?.ends_at ?? null));
  const [priority, setPriority] = useState(banner?.priority && banner.priority > 0 ? Math.min(banner.priority, 3) : 3);
  const [dismissible, setDismissible] = useState(banner?.dismissible ?? true);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [toastNode, showToast] = useToast();

  const genreName = genres.find(g => g.id === genreId)?.label ?? 'a genre';
  const aud: BannerAudience =
    audience.kind === 'genre'
      ? { kind: 'genre', genre_id: genreId }
      : audience.kind === 'below_version'
        ? { kind: 'below_version', version: version.trim() }
        : { kind: audience.kind };
  const live = banner?.live_state === 'live' || banner?.live_state === 'scheduled';
  const fields = (publish: boolean): BannerFields => ({
    placement,
    headline: headline.trim(),
    body: body.trim(),
    button_label: button.trim(),
    target: target as unknown as Json,
    image_url: image.trim() || null,
    audience: aud as unknown as Json,
    starts_at: fromLocal(starts),
    ends_at: fromLocal(ends),
    priority,
    dismissible,
    publish,
  });

  const whoWhen = () => {
    const who =
      aud.kind === 'subscribers'
        ? 'subscribers'
        : aud.kind === 'genre'
          ? `readers who chose ${genreName}`
          : aud.kind === 'below_version'
            ? `readers on app versions below ${aud.version}`
            : 'all readers';
    const from = starts && new Date(fromLocal(starts)!) > new Date() ? ` from ${dayMonth(fromLocal(starts)!)}` : '';
    return `${who}${from}`;
  };

  const save = (publish: boolean) =>
    start(async () => {
      setError(undefined);
      if (aud.kind === 'below_version' && !/^\d+(\.\d+){0,2}$/.test(aud.version ?? ''))
        return setError('Enter an app version like 26.0.');
      if (target?.kind === 'web' && !/^https:\/\/([a-z0-9-]+\.)*arpedia\.africa(\/|$)/.test(target.url ?? ''))
        return setError('Links can only open arpedia.africa pages.');
      const r = await saveBanner(banner?.id ?? null, fields(publish));
      if (!r.ok) return setError(r.error);
      const msg = publish
        ? `Saved. ${PLACEMENT_LABEL[placement]} shows it to ${whoWhen()}; phones update within about 15 minutes.`
        : 'Draft saved. Readers don’t see it until you publish.';
      router.push(`/banners?done=${encodeURIComponent(msg)}`);
    });

  const end = () =>
    start(async () => {
      if (!banner) return;
      const r = await endBanner(banner.id);
      if (!r.ok) return setError(r.error);
      showToast('Announcement ended. Readers stop seeing it within about 15 minutes.', () =>
        start(async () => {
          const u = await saveBanner(banner.id, { ...fields(true), ends_at: banner.ends_at });
          if (u.ok) {
            showToast('Back on. Readers see it again within about 15 minutes.');
            router.refresh();
          }
        }),
      );
      router.refresh();
    });

  const targetValue = !target
    ? 'none'
    : target.kind === 'screen'
      ? `screen:${target.screen}`
      : target.kind === 'book' || target.kind === 'author'
        ? `${target.kind}:${target.id}`
        : target.kind;
  const title = banner?.headline || 'New announcement';

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <Link href="/banners">In-app announcements</Link>
          <Icon name="chev" size="s" />
          <span>{title}</span>
        </div>
        <div className="ph__row">
          <div className="ph__title">
            <h1>{title}</h1>
            {banner ? (
              <div className="ph__meta">
                <span>{`${STATE_LABEL[banner.live_state]} · shown ${num(banner.shown)} times`}</span>
                <span>{`${num(banner.taps)} taps${banner.tap_rate != null ? ` (${banner.tap_rate.toFixed(1)}%)` : ''}`}</span>
                {banner.updated_by_name ? (
                  <span>{`Last edited by ${banner.updated_by_name}, ${dayMonth(banner.updated_at)}`}</span>
                ) : null}
              </div>
            ) : (
              <div className="ph__meta">
                <span>Not published yet</span>
              </div>
            )}
          </div>
          <div className="ph__acts">
            {banner && live ? (
              <button type="button" className="ib" aria-label="End now" disabled={pending} onClick={end}>
                <Icon name="stop" />
              </button>
            ) : null}
            {!banner || banner.live_state === 'draft' ? (
              <button type="button" className="btn btn-g" disabled={pending} onClick={() => save(false)}>
                Save draft
              </button>
            ) : (
              <Link className="btn btn-g" href="/banners">
                Cancel
              </Link>
            )}
            <button
              type="button"
              className="btn btn-p"
              disabled={pending || !headline.trim()}
              aria-busy={pending}
              onClick={() => save(true)}
            >
              {banner && banner.live_state !== 'draft' ? 'Save changes' : 'Publish'}
            </button>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="split split--wide">
          <div className="stack s20">
            {error ? (
              <div className="note err" role="alert">
                <span className="grow">{error}</span>
              </div>
            ) : null}
            <div className="panel">
              <div className="panel__head">
                <h2>1. What it says</h2>
              </div>
              <div className="panel__body">
                <div className="form">
                  <div className="f">
                    <span className="lbl">Placement</span>
                    <Radios
                      label="Placement"
                      value={placement}
                      options={PLACEMENTS.map(p => ({ key: p.key, title: PLACEMENT_LABEL[p.key], help: p.help }))}
                      onChange={setPlacement}
                    />
                  </div>
                  <div className="f">
                    <label htmlFor="b-h">Headline</label>
                    <div className={headline.length > LIMIT_HEADLINE ? 'inp error' : 'inp'}>
                      <input id="b-h" aria-label="Headline" value={headline} onChange={e => setHeadline(e.target.value)} />
                    </div>
                    <Counter n={headline.length} max={LIMIT_HEADLINE} />
                  </div>
                  <div className="f">
                    <label htmlFor="b-b">Body</label>
                    <textarea
                      id="b-b"
                      className={body.length > LIMIT_BODY ? 'inp ta error' : 'inp ta'}
                      aria-label="Body"
                      value={body}
                      onChange={e => setBody(e.target.value)}
                    ></textarea>
                    <Counter n={body.length} max={LIMIT_BODY} />
                  </div>
                  <div className="fgrid">
                    <div className="f">
                      <label htmlFor="b-btn">Button label</label>
                      <div className="inp">
                        <input
                          id="b-btn"
                          aria-label="Button label"
                          maxLength={24}
                          value={button}
                          onChange={e => setButton(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="f">
                      <label htmlFor="b-opens">Button opens</label>
                      <div className="inp sel">
                        <select
                          id="b-opens"
                          value={targetValue}
                          style={{ appearance: 'none' }}
                          onChange={e => {
                            const [k, rest] = e.target.value.split(':') as [string, string | undefined];
                            if (k === 'none') setTarget(null);
                            else if (k === 'book' || k === 'author') setTarget({ kind: k, id: rest });
                            else if (k === 'room') setTarget({ kind: 'room' });
                            else if (k === 'web') setTarget({ kind: 'web', url: 'https://arpedia.africa/' });
                            else setTarget({ kind: 'screen', screen: rest });
                          }}
                        >
                          <option value="none">Nothing (no button)</option>
                          {books.map(b => (
                            <option key={b.id} value={`book:${b.id}`}>{`Book: ${b.label}`}</option>
                          ))}
                          {authors.map(a => (
                            <option key={a.id} value={`author:${a.id}`}>{`Author: ${a.label}`}</option>
                          ))}
                          <option value="room">Reading room</option>
                          {SCREENS.map(sc => (
                            <option key={sc.key} value={`screen:${sc.key}`}>{`App screen: ${sc.label}`}</option>
                          ))}
                          <option value="web">A page on arpedia.africa</option>
                        </select>
                        <Icon name="chevd" size="s" />
                      </div>
                    </div>
                    {target?.kind === 'room' ? (
                      <div className="f">
                        <label htmlFor="b-room">Which reading room</label>
                        <div className="inp">
                          <input
                            id="b-room"
                            placeholder="Room link or id"
                            value={target.id ?? ''}
                            onChange={e => setTarget({ kind: 'room', id: e.target.value.trim().split('/').pop() })}
                          />
                        </div>
                      </div>
                    ) : target?.kind === 'web' ? (
                      <div className="f">
                        <label htmlFor="b-url">Page link</label>
                        <div className="inp">
                          <input id="b-url" value={target.url ?? ''} onChange={e => setTarget({ kind: 'web', url: e.target.value.trim() })} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="f">
                    <span className="lbl">
                      Image <span className="opt">optional</span>
                    </span>
                    {image ? (
                      <div className="file">
                        <span className="grow">
                          <b>{image.split('/').pop()}</b>
                          <small>1200 x 600, up to 300 KB · shows on the right of the card</small>
                        </span>
                        <button type="button" className="btn btn-q sm" onClick={() => setImage('')}>
                          Remove
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="inp">
                          <input aria-label="Image link" placeholder="https://…" onBlur={e => setImage(e.target.value.trim())} />
                        </div>
                        <span className="hint">An https link to a 1200 x 600 image, up to 300 KB.</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="panel">
              <div className="panel__head">
                <h2>2. Who sees it</h2>
              </div>
              <div className="panel__body">
                <Radios
                  label="Who sees it"
                  value={audience.kind}
                  options={[
                    { key: 'all', title: 'All readers', help: 'Everyone who opens the app' },
                    { key: 'subscribers', title: 'Subscribers', help: 'Active Monthly, Quarterly or Yearly plan' },
                    { key: 'genre', title: `Chose ${genreName}`, help: 'Readers who picked this genre in interests' },
                    {
                      key: 'below_version',
                      title: version ? `App below ${version}` : 'App below a version',
                      help: 'Readers who should update first',
                    },
                  ]}
                  onChange={k => setAudience({ kind: k })}
                />
                {audience.kind === 'genre' ? (
                  <div className="f">
                    <label htmlFor="b-genre">Genre</label>
                    <div className="inp sel">
                      <select id="b-genre" value={genreId} style={{ appearance: 'none' }} onChange={e => setGenreId(e.target.value)}>
                        {genres.map(g => (
                          <option key={g.id} value={g.id}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                      <Icon name="chevd" size="s" />
                    </div>
                  </div>
                ) : audience.kind === 'below_version' ? (
                  <div className="f">
                    <label htmlFor="b-ver">App version</label>
                    <div className="inp">
                      <input id="b-ver" placeholder="26.0" value={version} onChange={e => setVersion(e.target.value)} />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="panel">
              <div className="panel__head">
                <h2>3. When</h2>
              </div>
              <div className="panel__body">
                <div className="form">
                  <div className="fgrid">
                    <div className="f">
                      <label htmlFor="b-start">Starts (WAT)</label>
                      <div className="inp">
                        <input id="b-start" type="datetime-local" aria-label="Start" value={starts} onChange={e => setStarts(e.target.value)} />
                      </div>
                    </div>
                    <div className="f">
                      <label htmlFor="b-end">Ends (WAT)</label>
                      <div className="inp">
                        <input id="b-end" type="datetime-local" aria-label="End" value={ends} onChange={e => setEnds(e.target.value)} />
                      </div>
                    </div>
                  </div>
                  <details className="fold">
                    <summary>
                      More options <small>priority, dismiss button</small>
                    </summary>
                    <div className="fold__b">
                      <div className="f">
                        <label htmlFor="b-pri">Priority</label>
                        <div className="inp sel">
                          <select
                            id="b-pri"
                            value={priority}
                            style={{ appearance: 'none' }}
                            onChange={e => setPriority(Number(e.target.value))}
                          >
                            {PRIORITIES.map(p => (
                              <option key={p.stored} value={p.stored}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                          <Icon name="chevd" size="s" />
                        </div>
                      </div>
                      <div className="setrow">
                        <span className="setrow__b">
                          <b>Readers can dismiss it</b>
                          <small>Shows a close button. A dismissed card does not come back for that reader.</small>
                        </span>
                        <button
                          type="button"
                          className={dismissible ? 'switch on' : 'switch'}
                          role="switch"
                          aria-checked={dismissible}
                          aria-label="Dismissible"
                          onClick={() => setDismissible(d => !d)}
                        ></button>
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </div>
          <div className="sy-prevcol">
            <div className="phone">
              <div className="phone__s">
                <div className="sy-home">
                  <h4>Good morning, Ngozi</h4>
                  <div className="sy-bcard">
                    {dismissible ? <span className="x">x</span> : null}
                    <b>{headline.trim() || 'Your headline'}</b>
                    <p>{body.trim() || 'Your text shows here.'}</p>
                    {button.trim() ? <span className="sy-bbtn">{button.trim()}</span> : null}
                  </div>
                  <div className="sy-rowbook">
                    <span className="cv c3 x32"></span>
                    <span>
                      <b>Continue reading</b>The Alignment · chapter 7 · 42%
                    </span>
                  </div>
                  <div className="sy-rowbook">
                    <span className="cv c2 x32"></span>
                    <span>
                      <b>New this week</b>Still Waters, Lagos
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <span className="hint">{placement === 'home_top' ? 'Preview of the Home screen' : 'Preview of the card'}</span>
          </div>
        </div>
      </div>
      {toastNode}
    </section>
  );
}
