'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { OfflineNote, useOnline } from '@/components/online';
import { useToast } from '@/components/toast';
import { Otp } from '../pricing/otp';
import { publishPolicy, saveDraft, setAcceptAgain } from './actions';

export interface Policy {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  audience: 'readers' | 'authors' | 'everyone';
  accept_again: boolean;
  always_live: boolean;
  published: { id: string; version: number; published_at: string; accept_again: boolean };
  audience_count: number;
  accepted: number | null;
  draft: {
    id: string;
    body: string;
    change_summary: string | null;
    edited_at: string;
    edited_by: string | null;
  } | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const lagos = (iso: string) => new Date(new Date(iso).getTime() + 3_600_000);
/** "1 Sep 2026", Lagos time. */
const dayMonthYear = (iso: string) => {
  const d = lagos(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const dayMonth = (iso: string) => {
  const d = lagos(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const n0 = (n: number) => n.toLocaleString('en-NG');

const WHO: Record<Policy['audience'], string> = {
  readers: 'Readers',
  authors: 'Authors',
  everyone: 'Readers and authors',
};

/** Accepted latest: share of the audience that accepted the published version, or "Not asked". */
function Accepted({ p }: { p: Policy }) {
  if (p.accepted == null || !p.published.accept_again || p.published.version <= 1)
    return <td className="n muted">Not asked</td>;
  const pct = p.audience_count ? (p.accepted / p.audience_count) * 100 : 0;
  const text = `${pct.toLocaleString('en-NG', { maximumFractionDigits: 1 })}%`;
  return (
    <td className="n">
      {text}
      {p.audience === 'authors' && <small className="faint">{` of ${n0(p.audience_count)}`}</small>}
    </td>
  );
}

/**
 * s-policies: one row per legal page (published version, accept-again switch, acceptance, draft),
 * the open draft with its editor, and the folded four-step guide. Publishing asks for a fresh code.
 */
export function PoliciesView({ policies, open, canEdit }: { policies: Policy[]; open: string | null; canEdit: boolean }) {
  const router = useRouter();
  const online = useOnline();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const firstDraft = policies.find(p => p.draft)?.id ?? null;
  const [openId, setOpenId] = useState<string | null>(policies.find(p => p.slug === open)?.id ?? firstDraft);
  const current = policies.find(p => p.id === openId && p.draft) ?? null;

  const [body, setBody] = useState(current?.draft?.body ?? '');
  const [summary, setSummary] = useState(current?.draft?.change_summary ?? '');
  const [saved, setSaved] = useState<'saved' | 'saving' | 'error'>('saved');
  const [modal, setModal] = useState<'preview' | 'publish' | null>(null);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [acceptAgain, setAcceptAgainLocal] = useState(current?.accept_again ?? false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftId = current?.draft?.id;

  // A different draft opened (or the page refreshed with a new one): load its text.
  useEffect(() => {
    setBody(current?.draft?.body ?? '');
    setSummary(current?.draft?.change_summary ?? '');
    setAcceptAgainLocal(current?.accept_again ?? false);
    setSaved('saved');
  }, [draftId]); // only when the draft itself changes, not on every refresh

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // Changes are saved as you type (step 1 of the guide).
  const queueSave = (nextBody: string, nextSummary: string) => {
    if (!current || !canEdit) return;
    setSaved('saving');
    if (timer.current) clearTimeout(timer.current);
    const id = current.id;
    timer.current = setTimeout(async () => {
      const r = await saveDraft(id, nextBody, nextSummary);
      setSaved(r.ok ? 'saved' : 'error');
    }, 700);
  };

  const startDraft = (p: Policy) => {
    if (p.draft) {
      setOpenId(p.id);
      show(`Draft opened. Readers still see v${p.published.version} until you publish.`);
      return;
    }
    start(async () => {
      const r = await saveDraft(p.id, null, null);
      if (!r.ok) return show(r.error);
      setOpenId(p.id);
      show(`Draft of ${p.title} started. Readers still see the published version.`);
      router.refresh();
    });
  };

  const toggle = (p: Policy) =>
    start(async () => {
      const r = await setAcceptAgain(p.id, !p.accept_again);
      if (!r.ok) return show(r.error);
      show(
        p.accept_again
          ? `${p.title}: the next version shows without asking anyone to accept.`
          : `${p.title}: people must accept the next version on their next open.`,
      );
      if (p.id === current?.id) setAcceptAgainLocal(!p.accept_again);
      router.refresh();
    });

  const publish = () =>
    start(async () => {
      if (!current) return;
      setError(null);
      if (timer.current) {
        clearTimeout(timer.current);
        const s = await saveDraft(current.id, body, summary);
        if (!s.ok) return setError(s.error);
      }
      const r = await publishPolicy(current.id, summary, acceptAgain, otp);
      setOtp('');
      if (!r.ok) return setError(r.error);
      const v = current.published.version + 1;
      show(
        acceptAgain
          ? `${current.title} v${v} published. ${n0(current.audience_count)} ${WHO[current.audience].toLowerCase()} are asked to accept on their next open.`
          : `${current.title} v${v} published. People see it on their next open.`,
      );
      setModal(null);
      setOpenId(null);
      router.refresh();
    });

  const asked = current && acceptAgain;

  return (
    <>
      <section className="screen enter">
        <div className="band">
          <div className="band__row">
            <div className="band__text">
              <h1>Policies and legal pages</h1>
            </div>
          </div>
        </div>
        <div className="page">
          <OfflineNote online={online} />
          <div className="panel panel--flush">
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Published</th>
                    <th>Accept again on change</th>
                    <th className="r">Accepted latest</th>
                    <th>Draft</th>
                    <th className="acts"></th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map(p => (
                    <tr key={p.id}>
                      <td>
                        <b>{p.title}</b>
                        {p.subtitle && (
                          <small className="faint" style={{ display: 'block' }}>
                            {p.subtitle}
                          </small>
                        )}
                      </td>
                      <td className="nw">{`v${p.published.version} · ${dayMonthYear(p.published.published_at)}`}</td>
                      <td>
                        <button
                          className={p.accept_again ? 'switch on' : 'switch'}
                          role="switch"
                          type="button"
                          aria-checked={p.accept_again}
                          aria-label={`${p.title} accept again`}
                          disabled={!canEdit || pending || !online}
                          onClick={() => toggle(p)}
                        ></button>
                      </td>
                      <Accepted p={p} />
                      <td>
                        {p.draft ? (
                          <span className="st st-warn">{`Draft saved ${dayMonth(p.draft.edited_at)}`}</span>
                        ) : (
                          <span className="muted">No draft</span>
                        )}
                      </td>
                      <td className="acts">
                        {canEdit && (
                          <button
                            className={`btn ${p.draft ? 'btn-s' : 'btn-g'} sm`}
                            type="button"
                            disabled={pending || !online}
                            onClick={() => startDraft(p)}
                          >
                            {p.draft ? 'Review draft' : 'Edit draft'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {current?.draft && (
            <div className="panel">
              <div className="panel__head">
                <h2>{`${current.title} v${current.published.version + 1} draft`}</h2>
                <span className="st-plain">
                  {saved === 'saving' ? 'Saving…' : saved === 'error' ? "Couldn't save" : 'Draft'}
                </span>
              </div>
              <div className="panel__body">
                <p className="muted" style={{ fontSize: '13.5px' }}>
                  {`${summary.trim() || 'No summary yet.'} Edited${current.draft.edited_by ? ` by ${current.draft.edited_by}` : ''} on ${dayMonth(current.draft.edited_at)}.`}
                </p>
                {canEdit && (
                  <>
                    <div className="f">
                      <label htmlFor="pol-body">Policy text</label>
                      <textarea
                        id="pol-body"
                        className="inp ta"
                        rows={10}
                        value={body}
                        readOnly={!online}
                        onChange={e => {
                          setBody(e.target.value);
                          queueSave(e.target.value, summary);
                        }}
                      />
                    </div>
                    <div className="f">
                      <label htmlFor="pol-sum">What changed</label>
                      <textarea
                        id="pol-sum"
                        className="inp ta"
                        rows={2}
                        maxLength={400}
                        value={summary}
                        readOnly={!online}
                        placeholder="One or two plain sentences. Readers see this when asked to accept again."
                        onChange={e => {
                          setSummary(e.target.value);
                          queueSave(body, e.target.value);
                        }}
                      />
                      {saved === 'error' && <span className="hint err-t">Couldn&apos;t save the draft. Check your connection.</span>}
                    </div>
                  </>
                )}
                {asked ? (
                  <div className="kv-row">
                    <span>{`${WHO[current.audience]} to be asked again`}</span>
                    <b>{n0(current.audience_count)}</b>
                  </div>
                ) : (
                  <div className="kv-row">
                    <span>Asked to accept again</span>
                    <b>No</b>
                  </div>
                )}
                <div className="row">
                  <button className="btn btn-g" type="button" onClick={() => setModal('preview')}>
                    Preview draft
                  </button>
                  {canEdit && (
                    <button
                      className="btn btn-p"
                      type="button"
                      disabled={pending || !online || saved === 'saving'}
                      onClick={() => {
                        setError(null);
                        setOtp('');
                        setModal('publish');
                      }}
                    >
                      Publish new version
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          <details className="fold">
            <summary>
              How publishing works <small>4 steps</small>
            </summary>
            <div className="fold__b">
              <div className="stepper">
                <div className="stp ok">
                  <i>1</i>
                  <span>
                    <b>Edit the draft</b>
                    <small>Changes are saved as you type. Readers still see the published version.</small>
                  </span>
                </div>
                <div className="stp ok">
                  <i>2</i>
                  <span>
                    <b>Write what changed</b>
                    <small>One or two plain sentences. This is the text readers see when asked to accept again.</small>
                  </span>
                </div>
                <div className="stp on">
                  <i>3</i>
                  <span>
                    <b>Choose whether people must accept again</b>
                    <small>On: readers see a full-screen notice on next open and must tap Accept to keep reading.</small>
                  </span>
                </div>
                <div className="stp">
                  <i>4</i>
                  <span>
                    <b>Publish with your two-step code</b>
                    <small>A new version is created and the old one is kept for the record.</small>
                  </span>
                </div>
              </div>
            </div>
          </details>
        </div>
        {toast}
      </section>
      {current && modal === 'preview' && (
        <section className="screen overlay enter">
          <a className="backdrop" aria-label="Close" onClick={() => setModal(null)}></a>
          <div className="modal" role="dialog" aria-label={`Preview ${current.title}`}>
            <div className="modal__h">
              <div className="grow">
                <h2>{current.title}</h2>
                <p>As readers will see it</p>
              </div>
              <button className="ib" type="button" aria-label="Close" onClick={() => setModal(null)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal__b" style={{ whiteSpace: 'pre-wrap', maxHeight: '60vh', overflow: 'auto' }}>
              {body.trim() ? body : <span className="muted">The draft is empty.</span>}
            </div>
            <div className="modal__f">
              <button className="btn btn-g" type="button" onClick={() => setModal(null)}>
                Close
              </button>
            </div>
          </div>
        </section>
      )}
      {current && modal === 'publish' && (
        <section className="screen overlay enter">
          <a className="backdrop" aria-label="Close" onClick={() => !pending && setModal(null)}></a>
          <div className="modal" role="dialog" aria-label={`Publish ${current.title}`}>
            <div className="modal__h">
              <div className="grow">
                <h2>{`Publish ${current.title} v${current.published.version + 1}?`}</h2>
                <p>{`v${current.published.version} is kept for the record`}</p>
              </div>
              <button className="ib" type="button" aria-label="Close" onClick={() => !pending && setModal(null)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal__b">
              <div className="f">
                <span className="lbl">What changed</span>
                <span>{summary.trim() || <span className="muted">Write what changed in the draft first.</span>}</span>
              </div>
              <div className="setrow" style={{ padding: 0, border: 0 }}>
                <span className="setrow__b">
                  <b>Accept again</b>
                  <small>
                    {acceptAgain
                      ? `${n0(current.audience_count)} ${WHO[current.audience].toLowerCase()} see a full-screen notice on next open.`
                      : 'Nobody is asked. The new text shows on next open.'}
                  </small>
                </span>
                <button
                  className={acceptAgain ? 'switch on' : 'switch'}
                  role="switch"
                  type="button"
                  aria-checked={acceptAgain}
                  aria-label="Accept again"
                  disabled={pending}
                  onClick={() => setAcceptAgainLocal(!acceptAgain)}
                ></button>
              </div>
              <div className="f">
                <span className="lbl">2-step code</span>
                <Otp value={otp} onChange={setOtp} invalid={!!error} />
                {error && <span className="hint">{error}</span>}
              </div>
            </div>
            <div className="modal__f">
              <button className="btn btn-g" type="button" disabled={pending} onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-p"
                type="button"
                disabled={pending || !online || otp.length !== 6 || summary.trim().length < 10}
                onClick={publish}
              >
                {pending ? 'Publishing…' : 'Publish new version'}
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
