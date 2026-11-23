'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { saveTemplate, sendTest } from '../actions';
import type { TemplateRow } from '../emails-view';

export interface Version {
  number: number;
  subject: string;
  preheader: string;
  body: string;
  created_at: string;
  edited_by: string | null;
}

/** Sample values for the preview (s-email-template: Ifeoma, October 2026 cycle). */
const SAMPLE: Record<string, string> = {
  first_name: 'Ifeoma',
  author_first_name: 'Ifeoma',
  code: '482913',
  amount: '₦184,300',
  item: '1,500 credits',
  plan: 'Yearly',
  date: '15 Nov 2026',
  month: 'October',
  book_title: 'Harmattan Letters',
  note: 'Please split chapter 3 into two shorter chapters.',
  device: 'Redmi Note 13',
  city: 'Lagos',
  role: 'Publisher',
  link: 'https://arpedia.africa/…',
  reason: 'The bank rejected the account number',
  bank_masked: 'GTBank ••••4471',
  reference: 'ARP-RY-2610-0042',
};
const fill = (s: string) => s.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, k: string) => SAMPLE[k] ?? m);
const unknownVars = (text: string, allowed: string[]) =>
  [...new Set([...text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map(m => m[1]!))].filter(v => !allowed.includes(v));

const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short' });
const num = (n: number) => n.toLocaleString('en-NG');

export function TemplateEdit({
  template: t,
  versions,
  from,
  footer,
  email,
}: {
  template: TemplateRow;
  versions: Version[];
  from: string;
  footer: string;
  email: string;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(t.subject);
  const [preheader, setPreheader] = useState(t.preheader);
  const [body, setBody] = useState(t.body);
  const [enabled, setEnabled] = useState(t.enabled);
  const [phone, setPhone] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [toastNode, showToast] = useToast();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const unknown = unknownVars(`${subject} ${preheader} ${body}`, t.variables);
  const changed = subject !== t.subject || preheader !== t.preheader || body !== t.body || enabled !== t.enabled;
  const next = t.version + 1;

  const insert = (v: string) => {
    const el = bodyRef.current;
    const token = `{{${v}}}`;
    if (!el) return setBody(b => b + token);
    const [a, z] = [el.selectionStart, el.selectionEnd];
    setBody(body.slice(0, a) + token + body.slice(z));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + token.length, a + token.length);
    });
  };

  const paras = fill(body)
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);
  const greeting = /^hi\b/i.test(paras[0] ?? '') ? paras.shift() : null;

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <Link href="/emails">Emails</Link>
          <Icon name="chev" size="s" />
          <span>{t.name}</span>
        </div>
        <div className="ph__row">
          <div className="ph__title">
            <h1>{t.name}</h1>
            <div className="ph__meta">
              <span>{`${t.enabled ? 'In use' : 'Switched off'} · sent when ${t.trigger.charAt(0).toLowerCase()}${t.trigger.slice(1)}`}</span>
              <span>
                {`${num(t.sent_30d)} sent in 30 days${t.open_rate != null ? ` · ${t.open_rate.toFixed(1)}% opened` : ''}`}
              </span>
              <span>{`Version ${t.version}${t.edited_by ? `, edited ${dayMonth(t.edited_at)} by ${t.edited_by}` : ''}`}</span>
            </div>
          </div>
          <div className="ph__acts">
            <Link className="ib" href="/emails" aria-label="Cancel">
              <Icon name="x" />
            </Link>
            <button
              type="button"
              className="btn btn-g"
              disabled={pending || !subject.trim() || !body.trim()}
              onClick={() =>
                start(async () => {
                  const r = await sendTest({ subject, preheader, body });
                  showToast(r.ok ? `Test email sent to ${r.sentTo ?? email}` : (r.error ?? "The test email didn't send."));
                })
              }
            >
              <Icon name="send" />
              Send test to me
            </button>
            <button
              type="button"
              className="btn btn-p"
              disabled={pending || !changed || unknown.length > 0 || !subject.trim() || !body.trim()}
              aria-busy={pending}
              onClick={() =>
                start(async () => {
                  setError(undefined);
                  const r = await saveTemplate(t.key, {
                    subject,
                    preheader,
                    body,
                    enabled: enabled !== t.enabled ? enabled : undefined,
                  });
                  if (!r.ok) return setError(r.error);
                  router.push(
                    `/emails?done=${encodeURIComponent(`Saved as version ${r.version}. The next ${t.name} email uses it.`)}`,
                  );
                })
              }
            >
              {`Save as version ${next}`}
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
            ) : unknown.length ? (
              <div className="note err" role="alert">
                <span className="grow">
                  <b>{`Unknown ${unknown.length === 1 ? 'variable' : 'variables'}: ${unknown.join(', ')}`}</b>
                  {`This email can use ${t.variables.map(v => `{{${v}}}`).join(', ')}. Fix it to save.`}
                </span>
              </div>
            ) : null}
            <div className="panel">
              <div className="panel__head">
                <h2>Wording</h2>
              </div>
              <div className="panel__body">
                <div className="form">
                  <div className="f">
                    <label htmlFor="t-subj">Subject</label>
                    <div className="inp">
                      <input id="t-subj" aria-label="Subject" maxLength={120} value={subject} onChange={e => setSubject(e.target.value)} />
                    </div>
                    <div className="sy-cnt" style={subject.length > 60 ? { color: 'var(--warn-t)' } : undefined}>
                      {`${subject.length} characters · aim for under 60`}
                    </div>
                  </div>
                  <div className="f">
                    <label htmlFor="t-pre">
                      Preheader <span className="opt">the grey text beside the subject in an inbox</span>
                    </label>
                    <div className="inp">
                      <input
                        id="t-pre"
                        aria-label="Preheader"
                        maxLength={140}
                        value={preheader}
                        onChange={e => setPreheader(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="f">
                    <span className="lbl">Body</span>
                    <div className="sy-chips" aria-label="Insert a variable">
                      {t.variables.map(v => (
                        <button key={v} type="button" className="sy-chip" onClick={() => insert(v)}>
                          {`{{${v}}}`}
                        </button>
                      ))}
                    </div>
                    <textarea
                      ref={bodyRef}
                      className="inp ta sy-body"
                      aria-label="Body"
                      rows={12}
                      maxLength={20000}
                      value={body}
                      onChange={e => setBody(e.target.value)}
                    ></textarea>
                  </div>
                  {t.can_disable ? (
                    <div className="setrow">
                      <span className="setrow__b">
                        <b>Send this email</b>
                        <small>Switched off, readers don’t get it. The next save applies it.</small>
                      </span>
                      <button
                        type="button"
                        className={enabled ? 'switch on' : 'switch'}
                        role="switch"
                        aria-checked={enabled}
                        aria-label="Send this email"
                        onClick={() => setEnabled(e => !e)}
                      ></button>
                    </div>
                  ) : (
                    <span className="hint">
                      {t.finance_review
                        ? 'Money emails can be reworded but not switched off. Finance reviews the wording.'
                        : 'Security emails can be reworded but not switched off.'}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <details className="fold">
              <summary>
                Version history <small>{`${versions.length} ${versions.length === 1 ? 'version' : 'versions'}`}</small>
              </summary>
              <div className="fold__b">
                <div className="tl">
                  {versions.map((v, i) => (
                    <div key={v.number} className={i === 0 ? 'tl__i org' : 'tl__i'}>
                      <b>{`Version ${v.number}${i === 0 ? ' (in use)' : ''}`}</b>
                      <small>
                        {`${dayMonth(v.created_at)} · ${v.edited_by ?? 'Arpedia'} · `}
                        {i === 0 ? (
                          v.subject
                        ) : (
                          <a
                            className="link"
                            href={`#v${v.number}`}
                            onClick={e => {
                              e.preventDefault();
                              const before = { subject, preheader, body };
                              setSubject(v.subject);
                              setPreheader(v.preheader);
                              setBody(v.body);
                              showToast(`Version ${v.number} is back as a draft. Save to use it.`, () => {
                                setSubject(before.subject);
                                setPreheader(before.preheader);
                                setBody(before.body);
                              });
                            }}
                          >
                            {`Restore version ${v.number}`}
                          </a>
                        )}
                      </small>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </div>
          <div className="stack">
            <div className="panel">
              <div className="panel__head">
                <h2>Preview</h2>
                <div className="seg" role="tablist">
                  <button type="button" role="tab" aria-selected={!phone} className={phone ? '' : 'is-selected'} onClick={() => setPhone(false)}>
                    Desktop
                  </button>
                  <button type="button" role="tab" aria-selected={phone} className={phone ? 'is-selected' : ''} onClick={() => setPhone(true)}>
                    Phone
                  </button>
                </div>
              </div>
              <div className="panel__body">
                <div className="sy-inbox">
                  <b>{fill(subject) || 'Subject'}</b>
                  <span className="muted">{fill(preheader)}</span>
                  <small className="faint">{`${from} · now`}</small>
                </div>
                <div className="sy-mail">
                  <div className="sy-mail__c" style={phone ? { maxWidth: 320 } : undefined}>
                    <div className="sy-mail__h">
                      <svg className="ico" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                        <image href="/brand/mark.png" width="48" height="48" />
                      </svg>
                      <span className="wmk wmk--night" role="img" aria-label="arpedia"></span>
                    </div>
                    <div className="sy-mail__b">
                      <h3>{fill(subject)}</h3>
                      {greeting ? <p>{greeting}</p> : null}
                      {paras.map((p, i) => (
                        <p key={i}>
                          {p.split('\n').map((line, j) => (
                            <span key={j}>
                              {j ? <br /> : null}
                              {line}
                            </span>
                          ))}
                        </p>
                      ))}
                    </div>
                    {footer ? <div className="sy-mail__f">{footer}</div> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {toastNode}
    </section>
  );
}
