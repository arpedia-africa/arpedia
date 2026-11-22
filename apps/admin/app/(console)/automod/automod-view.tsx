'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { REASON_LABELS, type Json, type ReportReason, type Severity } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { addWord, removeWord, saveSettings } from './actions';

type Scope = 'everywhere' | 'chat_dms' | 'reviews';
type WordAction = 'hide' | 'hide_and_report' | 'blur' | 'warn';

export interface AutomodWord {
  id: string;
  text: string;
  is_phrase: boolean;
  category: string;
  scope: Scope;
  action: WordAction;
  hits_7d: number;
}

interface Settings {
  severity: Partial<Record<ReportReason, Severity>>;
  auto_hide_threshold: number;
  hide_at_one_reasons: string[];
  reports_per_day: number;
  links: { block_new_accounts_days: number; block_dm_links_to_authors: boolean; allowed_domains: string[] };
  rate_limits: { messages_per_minute: number; dms_per_day: number; reports_per_day: number };
  new_accounts: { no_room_posts_days: number; review_wait_days: number };
  spam: {
    identical_messages: number;
    identical_window_minutes: number;
    cross_channel: number;
    cross_channel_window_minutes: number;
    phone_numbers: string;
  };
}

export interface AutomodData {
  settings: Settings;
  words: AutomodWord[];
  can_edit: boolean;
}

const SCOPE_LABEL: Record<Scope, string> = { everywhere: 'Everywhere', chat_dms: 'Chat and DMs', reviews: 'Reviews' };
const ACTION_LABEL: Record<WordAction, string> = {
  hide: 'Hide',
  hide_and_report: 'Hide and report',
  blur: 'Blur and flag',
  warn: 'Warn sender',
};
const CATEGORIES = ['threats', 'sexual', 'spam', 'piracy', 'spoilers', 'harassment', 'hate', 'abuse'] as const;
const CATEGORY_LABEL: Record<string, string> = {
  threats: 'Threats',
  sexual: 'Sexual content',
  spam: 'Spam',
  piracy: 'Piracy',
  spoilers: 'Spoilers',
  harassment: 'Harassment',
  hate: 'Hate speech',
  abuse: 'Abuse',
};
const REASON_HELP: Record<ReportReason, string> = {
  spam: 'Selling, links, repeated posts',
  harassment: 'Insults, targeting a person',
  hate: 'Tribe, religion, gender, disability',
  sexual: 'Explicit images or messages',
  violence: 'Threats against a person',
  self_harm: 'Talk of hurting themselves',
  copyright: 'Copied or pirated books',
  spoilers: 'Reviews and discussions',
  impersonation: 'Pretending to be an author or staff',
  other: 'Free text, staff sort it',
};
const REASONS = Object.keys(REASON_LABELS) as ReportReason[];
const HIDE_AT_ONE = ['violence', 'sexual'];
const num = (n: number) => n.toLocaleString('en-NG');
const hours = (m: number) => (m % 60 === 0 ? `${m / 60} ${m === 60 ? 'hour' : 'hours'}` : `${m} minutes`);

function Switch({
  on,
  label,
  disabled,
  onToggle,
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`switch${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
    />
  );
}

/** s-automod. */
export function AutomodView({ data, failed }: { data: AutomodData | null; failed: boolean }) {
  const router = useRouter();
  const [toastNode, showToast] = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Settings | null>(data?.settings ?? null);
  const [adding, setAdding] = useState(false);
  const [domain, setDomain] = useState<string | null>(null);

  if (failed || !data || !draft) {
    return (
      <section className="screen enter">
        <div className="band">
          <div className="band__row">
            <div className="band__text">
              <h1>Safety rules</h1>
            </div>
          </div>
        </div>
        <div className="page">
          <div className="panel">
            <div className="empty">
              <b>Safety rules didn&apos;t load</b>
              <span>Check your connection and refresh the page.</span>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const edit = data.can_edit;
  const changed = (Object.keys(draft) as (keyof Settings)[]).filter(
    (k) => JSON.stringify(draft[k]) !== JSON.stringify(data.settings[k]),
  );
  const set = <K extends keyof Settings>(key: K, value: Settings[K], toast?: string) => {
    setDraft({ ...draft, [key]: value });
    if (toast) showToast(toast);
  };
  const toggle = <K extends 'links' | 'new_accounts' | 'spam'>(key: K, patch: Partial<Settings[K]>, label: string, on: boolean) =>
    set(key, { ...draft[key], ...patch }, `${label} ${on ? 'on' : 'off'}. Save changes to apply.`);
  const numberInput = (value: number, onChange: (n: number) => void, label: string, suffix: string) => (
    <div className="inp">
      <input
        inputMode="numeric"
        aria-label={label}
        value={value}
        disabled={!edit}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ''));
          if (Number.isFinite(n)) onChange(Math.min(n, 999));
        }}
      />
      <span className="suf">{suffix}</span>
    </div>
  );

  const save = () =>
    start(async () => {
      const res = await saveSettings(Object.fromEntries(changed.map((k) => [k, draft[k] as unknown as Json])));
      if (res.error) return showToast(res.error);
      showToast('Safety rules saved. Applies to new messages now.');
      router.refresh();
    });
  const remove = (w: AutomodWord) =>
    start(async () => {
      const res = await removeWord(w.id);
      if (res.error) return showToast(res.error);
      showToast(`'${w.text}' removed from muted words`, () =>
        start(async () => {
          const back = await addWord({ text: w.text, isPhrase: w.is_phrase, category: w.category, scope: w.scope, action: w.action });
          showToast(back.error ?? `'${w.text}' is back on the list`);
          router.refresh();
        }),
      );
      router.refresh();
    });

  const { links, rate_limits: rate, new_accounts: fresh, spam } = draft;
  const hideAtOne = draft.hide_at_one_reasons.length > 0;

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Safety rules</h1>
          </div>
          <div className="band__acts">
            {edit ? (
              <button type="button" className="btn btn-n" disabled={pending || changed.length === 0} onClick={save}>
                Save changes
              </button>
            ) : null}
            <a className="ib" href="/audit" aria-label="Change history">
              <Icon name="clock" />
            </a>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="split">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Muted words</h2>
                <span className="sub">{`${num(data.words.length)} ${data.words.length === 1 ? 'word or phrase' : 'words and phrases'}`}</span>
                {edit ? (
                  <button type="button" className="btn btn-s sm" onClick={() => setAdding(true)}>
                    <Icon name="plus" />
                    Add word
                  </button>
                ) : null}
              </div>
              {data.words.length === 0 ? (
                <div className="empty">
                  <b>No muted words yet</b>
                  <span>Add a word or phrase and Arpedia hides it before anyone sees it.</span>
                </div>
              ) : (
                <div className="tw">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Word or phrase</th>
                        <th>Category</th>
                        <th>Applies to</th>
                        <th>Action</th>
                        <th className="r">Hits, 7 days</th>
                        <th className="acts"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.words.map((w) => (
                        <tr key={w.id}>
                          <td>
                            <b>{w.text}</b>
                          </td>
                          <td>{CATEGORY_LABEL[w.category] ?? w.category}</td>
                          <td>{SCOPE_LABEL[w.scope]}</td>
                          <td>{ACTION_LABEL[w.action]}</td>
                          <td className="n">{num(w.hits_7d)}</td>
                          <td className="acts">
                            {edit ? (
                              <button
                                type="button"
                                className="ib sm"
                                aria-label={`Remove ${w.text}`}
                                disabled={pending}
                                onClick={() => remove(w)}
                              >
                                <Icon name="x" />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <details className="fold">
              <summary>
                Report reasons <small>shown to readers when they tap Report</small>
              </summary>
              <div className="fold__b">
                <div className="list">
                  {REASONS.map((r) => {
                    const sev = draft.severity[r] ?? 'low';
                    return (
                      <div key={r} className="ts-rule">
                        <span>
                          <b>{REASON_LABELS[r]}</b>
                          <small>{REASON_HELP[r]}</small>
                        </span>
                        <span className={sev === 'high' ? 'st st-err' : 'muted'}>{sev[0]!.toUpperCase() + sev.slice(1)}</span>
                        <Switch on label={`${REASON_LABELS[r]} offered`} disabled onToggle={() => {}} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </details>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Auto-hide</h2>
              </div>
              <div className="panel__body">
                <div className="f">
                  <label>Hide content when reported by</label>
                  {numberInput(draft.auto_hide_threshold, (n) => set('auto_hide_threshold', Math.max(1, n)), 'Reporters before auto-hide', 'different readers')}
                  <span className="hint">Staff are alerted at the same time.</span>
                </div>
                <div className="setrow">
                  <span className="setrow__b">
                    <b>High severity hides at 1 report</b>
                    <small>Threats and sexual content</small>
                  </span>
                  <Switch
                    on={hideAtOne}
                    label="High severity hides at 1 report"
                    disabled={!edit}
                    onToggle={() =>
                      set('hide_at_one_reasons', hideAtOne ? [] : HIDE_AT_ONE, `High severity hides at 1 report ${hideAtOne ? 'off' : 'on'}. Save changes to apply.`)
                    }
                  />
                </div>
              </div>
            </div>
            <details className="fold">
              <summary>
                More rules <small>links, limits, new accounts, spam</small>
              </summary>
              <div className="fold__b">
                <b>Link rules</b>
                <div className="setrow">
                  <span className="setrow__b">
                    <b>Block links from new accounts</b>
                    <small>Accounts under 7 days old</small>
                  </span>
                  <Switch
                    on={links.block_new_accounts_days > 0}
                    label="Block links from new accounts"
                    disabled={!edit}
                    onToggle={() =>
                      toggle('links', { block_new_accounts_days: links.block_new_accounts_days > 0 ? 0 : 7 }, 'Block links from new accounts', !(links.block_new_accounts_days > 0))
                    }
                  />
                </div>
                <div className="setrow">
                  <span className="setrow__b">
                    <b>Block links in DMs to authors</b>
                    <small>Except arpedia.africa</small>
                  </span>
                  <Switch
                    on={links.block_dm_links_to_authors}
                    label="Block links in DMs to authors"
                    disabled={!edit}
                    onToggle={() =>
                      toggle('links', { block_dm_links_to_authors: !links.block_dm_links_to_authors }, 'Block links in DMs to authors', !links.block_dm_links_to_authors)
                    }
                  />
                </div>
                <div className="f">
                  <label>Allowed domains</label>
                  <div className="ts-chips">
                    {links.allowed_domains.map((d) => (
                      <span key={d} className="ts-pill">
                        {d}
                        {edit && d !== 'arpedia.africa' ? (
                          <button
                            type="button"
                            className="ib sm"
                            aria-label={`Remove ${d}`}
                            onClick={() =>
                              set('links', { ...links, allowed_domains: links.allowed_domains.filter((x) => x !== d) }, `${d} removed. Save changes to apply.`)
                            }
                          >
                            <Icon name="x" />
                          </button>
                        ) : null}
                      </span>
                    ))}
                    {edit && domain === null ? (
                      <button type="button" className="fchip" onClick={() => setDomain('')}>
                        + Add
                      </button>
                    ) : null}
                  </div>
                  {domain !== null ? (
                    <div className="inp">
                      <input
                        autoFocus
                        aria-label="Domain to allow"
                        placeholder="example.com"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        onBlur={() => !domain.trim() && setDomain(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setDomain(null);
                          if (e.key !== 'Enter') return;
                          const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
                          if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return showToast('Type a domain like example.com');
                          if (!links.allowed_domains.includes(d))
                            set('links', { ...links, allowed_domains: [...links.allowed_domains, d] }, 'Domain added. Save changes to apply.');
                          setDomain(null);
                        }}
                      />
                    </div>
                  ) : null}
                </div>
                <b>Rate limits</b>
                <div className="f">
                  <label>Messages per minute, chat</label>
                  {numberInput(rate.messages_per_minute, (n) => set('rate_limits', { ...rate, messages_per_minute: Math.max(1, n) }), 'Messages per minute', 'per reader')}
                </div>
                <div className="f">
                  <label>DMs per day, accounts under 7 days</label>
                  {numberInput(rate.dms_per_day, (n) => set('rate_limits', { ...rate, dms_per_day: Math.max(1, n) }), 'DMs per day', 'per day')}
                </div>
                <div className="f">
                  <label>Reports per reader per day</label>
                  {numberInput(draft.reports_per_day, (n) => set('reports_per_day', Math.max(1, n)), 'Reports per reader per day', 'max')}
                </div>
                <b>New-account restrictions · first 7 days</b>
                <div className="setrow">
                  <span className="setrow__b">
                    <b>No posting in reading rooms</b>
                    <small>Can read and react</small>
                  </span>
                  <Switch
                    on={fresh.no_room_posts_days > 0}
                    label="No posting in reading rooms"
                    disabled={!edit}
                    onToggle={() =>
                      toggle('new_accounts', { no_room_posts_days: fresh.no_room_posts_days > 0 ? 0 : 7 }, 'No posting in reading rooms', !(fresh.no_room_posts_days > 0))
                    }
                  />
                </div>
                <div className="setrow">
                  <span className="setrow__b">
                    <b>Reviews wait for the 3-day mark</b>
                    <small>Stops review bombing</small>
                  </span>
                  <Switch
                    on={fresh.review_wait_days > 0}
                    label="Reviews wait for the 3-day mark"
                    disabled={!edit}
                    onToggle={() =>
                      toggle('new_accounts', { review_wait_days: fresh.review_wait_days > 0 ? 0 : 3 }, 'Reviews wait for the 3-day mark', !(fresh.review_wait_days > 0))
                    }
                  />
                </div>
                <b>Spam detection</b>
                <div className="setrow">
                  <span className="setrow__b">
                    <b>Repeated identical messages</b>
                    <small>{`${spam.identical_messages || 3} in ${hours(spam.identical_window_minutes)}`}</small>
                  </span>
                  <Switch
                    on={spam.identical_messages > 0}
                    label="Repeated identical messages"
                    disabled={!edit}
                    onToggle={() =>
                      toggle('spam', { identical_messages: spam.identical_messages > 0 ? 0 : 3 }, 'Repeated identical messages', !(spam.identical_messages > 0))
                    }
                  />
                </div>
                <div className="setrow">
                  <span className="setrow__b">
                    <b>Same text in many channels</b>
                    <small>{`${spam.cross_channel || 5} channels in ${hours(spam.cross_channel_window_minutes)}`}</small>
                  </span>
                  <Switch
                    on={spam.cross_channel > 0}
                    label="Same text in many channels"
                    disabled={!edit}
                    onToggle={() =>
                      toggle('spam', { cross_channel: spam.cross_channel > 0 ? 0 : 5 }, 'Same text in many channels', !(spam.cross_channel > 0))
                    }
                  />
                </div>
                <div className="setrow">
                  <span className="setrow__b">
                    <b>Phone numbers in chat</b>
                    <small>Hide, ask sender to edit</small>
                  </span>
                  <Switch
                    on={spam.phone_numbers !== 'off'}
                    label="Phone numbers in chat"
                    disabled={!edit}
                    onToggle={() =>
                      toggle('spam', { phone_numbers: spam.phone_numbers !== 'off' ? 'off' : 'hide_and_ask' }, 'Phone numbers in chat', spam.phone_numbers === 'off')
                    }
                  />
                </div>
              </div>
            </details>
            {!edit ? <span className="hint">Only Moderators and Super admins can change safety rules.</span> : null}
          </div>
        </div>
      </div>
      {adding ? (
        <AddWordModal
          onClose={() => setAdding(false)}
          onSaved={(text) => {
            setAdding(false);
            showToast(`'${text}' added to muted words`);
            router.refresh();
          }}
        />
      ) : null}
      {toastNode}
    </section>
  );
}

function AddWordModal({ onClose, onSaved }: { onClose: () => void; onSaved: (text: string) => void }) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<string>('spam');
  const [scope, setScope] = useState<Scope>('everywhere');
  const [action, setAction] = useState<WordAction>('hide');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const clean = text.trim().toLowerCase();
  const submit = () =>
    start(async () => {
      const res = await addWord({ text: clean, isPhrase: /\s|,/.test(clean), category, scope, action });
      if (res.error) setError(res.error);
      else onSaved(clean);
    });

  return (
    <div className="screen overlay">
      <a className="backdrop" href="#close" aria-label="Close" onClick={(e) => (e.preventDefault(), onClose())} />
      <div className="modal" role="dialog" aria-label="Add muted word">
        <div className="modal__h">
          <div className="grow">
            <h2>Add a muted word</h2>
            <p>Applies to new messages straight away.</p>
          </div>
          <button type="button" className="ib" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="modal__b">
          <div className="f full">
            <label htmlFor="aw-text">Word or phrase</label>
            <div className="inp">
              <input
                id="aw-text"
                autoFocus
                maxLength={80}
                value={text}
                onChange={(e) => (setText(e.target.value), setError(null))}
                onKeyDown={(e) => e.key === 'Enter' && clean && submit()}
              />
            </div>
            <span className="hint">Separate spellings with commas, like: pdf free, free download</span>
          </div>
          <div className="f">
            <label htmlFor="aw-cat">Category</label>
            <select id="aw-cat" className="inp sel" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="f">
            <label htmlFor="aw-scope">Applies to</label>
            <select id="aw-scope" className="inp sel" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="f">
            <label htmlFor="aw-action">Action</label>
            <select id="aw-action" className="inp sel" value={action} onChange={(e) => setAction(e.target.value as WordAction)}>
              {(Object.keys(ACTION_LABEL) as WordAction[]).map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABEL[a]}
                </option>
              ))}
            </select>
          </div>
          {error ? <span className="hint err">{error}</span> : null}
        </div>
        <div className="modal__f">
          <button type="button" className="btn btn-g" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-p" disabled={pending || !clean} onClick={submit}>
            Add word
          </button>
        </div>
      </div>
    </div>
  );
}
