'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { naira, planCheck, type PlanInfo } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { describeChange, nairaDec, num, RULE_LABEL, ruleValue, type Plan, type Rules, type Topup } from '../pricing/format';
import { Otp } from '../pricing/otp';
import { previewRules, saveRules, type RulesPreview } from './actions';

type Edits = Omit<Rules, 'store_fee_pct'>;

interface Form {
  words: string;
  cpp: string;
  value: string;
  preview: string;
  split: string;
  undo: string;
  author: string;
  rollover: string;
  pause: string;
  autoUnlock: boolean;
}

const toForm = (r: Rules): Form => ({
  words: String(r.words_per_page),
  cpp: String(r.credits_per_page),
  value: String(r.credit_value_kobo / 100),
  preview: String(r.preview_pct),
  split: String(r.split_pages),
  undo: String(r.undo_minutes),
  author: (r.author_rate_kobo / 100).toFixed(2),
  rollover: String(r.rollover_cap_plans),
  pause: String(r.pause_max_months),
  autoUnlock: r.auto_unlock_default,
});

/** The form as rules, or null while a field isn't a number. Naira become kobo. */
function toRules(f: Form): Edits | null {
  const n = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(/,/g, '')));
  const out: Edits = {
    words_per_page: n(f.words),
    credits_per_page: n(f.cpp),
    credit_value_kobo: Math.round(n(f.value) * 100),
    preview_pct: n(f.preview),
    split_pages: n(f.split),
    undo_minutes: n(f.undo),
    author_rate_kobo: Math.round(n(f.author) * 100),
    rollover_cap_plans: n(f.rollover),
    pause_max_months: n(f.pause),
    auto_unlock_default: f.autoUnlock,
  };
  return Object.values(out).every(v => typeof v === 'boolean' || Number.isFinite(v)) ? out : null;
}

interface Log {
  title: string;
  small: string;
  pending: boolean;
}

/**
 * s-pricing-rules and its confirm step (s-pricing-rules-confirm, rules 24 to 26). "Review and save" asks the
 * server what would change, then the confirm modal takes a fresh 2-step code. The plan check updates as you type.
 */
export function RulesForm({
  rules,
  plans,
  topups,
  liveBooks,
  example,
  lastChange,
  log,
  canSave,
}: {
  rules: Rules;
  plans: Plan[];
  topups: Topup[];
  liveBooks: number;
  example: { title: string; words: number } | null;
  lastChange: { at: string; by: string | null };
  log: Log[];
  canSave: boolean;
}) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [f, setF] = useState<Form>(() => toForm(rules));
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<RulesPreview | null>(null);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dec = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF(p => ({ ...p, [k]: e.target.value.replace(/[^\d.,]/g, '') }));

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu]);

  const parsed = toRules(f);
  const draft: Rules = { ...rules, ...parsed };
  const changes = parsed ? describeChange(rules, parsed) : [];
  const dirty = changes.length > 0;

  // Plan check (rule 26) on the draft: every plan at its Play price, and the top-ups.
  const infos: PlanInfo[] = plans.map(p => ({
    code: p.code,
    months: p.months,
    credits: p.credits,
    bonusCredits: p.bonus_credits,
    pricePlayKobo: p.price_play_kobo,
    priceWebKobo: p.price_web_kobo,
  }));
  const checks = planCheck(
    infos,
    topups.map(t => ({ code: t.code, credits: t.credits, priceKobo: t.price_kobo })),
    { authorRateKobo: draft.author_rate_kobo, storeFeePct: rules.store_fee_pct },
  );
  const planOk = checks.every(c => c.ok);
  const rows = [
    ...plans.map(p => {
      const c = checks.find(x => x.code === p.code && x.store === 'play')!;
      return {
        key: p.code,
        name: p.name,
        small: `${naira(p.price_play_kobo)} · ${num(p.total_credits)} credits`,
        net: c.netPerCreditKobo,
      };
    }),
    ...(topups.length
      ? [
          {
            key: 'topups',
            name: 'Top-ups',
            small: `${naira(Math.round(Math.min(...topups.map(t => t.price_kobo / t.credits))))} a credit`,
            net: Math.min(...checks.filter(c => c.store === 'any').map(c => c.netPerCreditKobo)),
          },
        ]
      : []),
  ];
  const tightest = rows.length ? rows.reduce((a, b) => (b.net < a.net ? b : a)) : null;
  const vatNet = tightest ? tightest.net / 1.075 : 0;

  const cpp = draft.credits_per_page;
  const value = draft.credit_value_kobo;
  const words = draft.words_per_page;
  const exPages = example ? Math.ceil(example.words / words) : 0;
  const exCredits = example ? Math.max(Math.ceil((example.words / words) * cpp), 1) : 0;

  const review = () => {
    if (!canSave) return show('Only a Super admin can save pricing rules.');
    if (!parsed) return show('Check the numbers. Every rule needs a number.');
    if (!dirty) return show('Nothing to save yet. Change a rule first.');
    start(async () => {
      const r = await previewRules(parsed);
      if (!r.ok) return show(r.error);
      setOtp('');
      setError(null);
      setConfirm(r.preview);
    });
  };

  const save = () =>
    start(async () => {
      if (!parsed) return;
      setError(null);
      const r = await saveRules(parsed, otp);
      if (!r.ok) {
        setError(r.error);
        if (r.needCode) setOtp('');
        return;
      }
      const n = confirm?.books_changed ?? 0;
      setConfirm(null);
      show(`Pricing rules saved. ${num(n)} book price${n === 1 ? '' : 's'} update${n === 1 ? 's' : ''} at 00:00 WAT.`);
      router.refresh();
    });

  const exportRules = () => {
    const blob = new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pricing-rules.json';
    a.click();
    URL.revokeObjectURL(a.href);
    show('Pricing rules exported as JSON');
  };

  const words0 = rules.words_per_page;
  const dateText = new Date(lastChange.at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });

  return (
    <>
      <section className="screen enter">
        <div className="ph">
          <div className="ph__row">
            <div className="ph__title">
              <h1>Pricing rules</h1>
              <div className="ph__meta">
                <span>{`${num(liveBooks)} live book${liveBooks === 1 ? '' : 's'}`}</span>
                <span>{`1 credit = ${naira(rules.credit_value_kobo)}`}</span>
                <span>{`Last changed ${dateText}${lastChange.by ? ` by ${lastChange.by}` : ''}`}</span>
              </div>
            </div>
            <div className="ph__acts">
              <button className="btn btn-p" type="button" disabled={pending || !planOk} onClick={review}>
                {pending && !confirm ? 'Checking…' : 'Review and save'}
              </button>
              <div className="mwrap" ref={menuRef}>
                <button className="ib" type="button" aria-expanded={menu} aria-label="More actions" onClick={() => setMenu(o => !o)}>
                  <Icon name="more" />
                </button>
                {menu && (
                  <div className="menu" onClick={() => setMenu(false)}>
                    <Link href="/pricing">Plans and pricing</Link>
                    <a role="button" tabIndex={0} onClick={exportRules}>
                      Export rules
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="page">
          <div className="split split--wide">
            <div className="stack s20">
              <div className="panel">
                <div className="panel__head">
                  <h2>Book price</h2>
                </div>
                <div className="panel__body form">
                  <div className="fgrid">
                    <div className="f">
                      <label htmlFor="pr-w">Words per standard page</label>
                      <div className="inp">
                        <input id="pr-w" inputMode="numeric" value={f.words} onChange={dec('words')} />
                        <span className="suf">words</span>
                      </div>
                      <span className="hint">
                        {words === words0
                          ? 'Fewer words a page means more pages and higher prices.'
                          : `Was ${words0}. ${words < words0 ? 'Fewer words a page means more pages and higher prices.' : 'More words a page means fewer pages and lower prices.'}`}
                      </span>
                    </div>
                    <div className="f">
                      <label htmlFor="pr-c">Credits per page</label>
                      <div className="inp">
                        <input id="pr-c" inputMode="decimal" value={f.cpp} onChange={dec('cpp')} />
                        <span className="suf">credits</span>
                      </div>
                      <span className="hint">{`${nairaDec(cpp * value)} a page at ${naira(value)} a credit`}</span>
                    </div>
                    <div className="f">
                      <label htmlFor="pr-i">A full-page image counts as</label>
                      <div className="inp ro">
                        <input id="pr-i" value="1" readOnly />
                        <span className="suf">page</span>
                      </div>
                    </div>
                    <div className="f">
                      <label htmlFor="pr-v">Credit value</label>
                      <div className="inp">
                        <span className="pre">₦</span>
                        <input id="pr-v" inputMode="decimal" value={f.value} onChange={dec('value')} />
                      </div>
                      <span className="hint">Top-ups sell at this price</span>
                    </div>
                  </div>
                  <div className="mn-rec">
                    {example ? (
                      <>
                        <b>{`${num(example.words)} words → ${num(exPages)} pages → ${num(exCredits)} credits (${naira(exCredits * value)})`}</b>
                        <span>{`${example.title}. The book total is rounded up to a whole credit; a 600-page book is ${num(Math.max(Math.ceil(600 * cpp), 1))} credits (${naira(Math.max(Math.ceil(600 * cpp), 1) * value)}).`}</span>
                      </>
                    ) : (
                      <>
                        <b>{`A 250-page book is ${num(Math.max(Math.ceil(250 * cpp), 1))} credits (${naira(Math.max(Math.ceil(250 * cpp), 1) * value)})`}</b>
                        <span>The book total is rounded up to a whole credit.</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="panel">
                <div className="panel__head">
                  <h2>Reading and paying</h2>
                </div>
                <div className="panel__body form">
                  <div className="fgrid">
                    <div className="f">
                      <label htmlFor="pr-p">Free preview</label>
                      <div className="inp">
                        <input id="pr-p" inputMode="decimal" value={f.preview} onChange={dec('preview')} />
                        <span className="suf">% of the book</span>
                      </div>
                      <span className="hint">5% to 25%</span>
                    </div>
                    <div className="f">
                      <label htmlFor="pr-s">Split chapters longer than</label>
                      <div className="inp">
                        <input id="pr-s" inputMode="numeric" value={f.split} onChange={dec('split')} />
                        <span className="suf">pages</span>
                      </div>
                      <span className="hint">Books without chapters are split the same way</span>
                    </div>
                    <div className="f">
                      <label htmlFor="pr-u">Reader can undo a chapter charge for</label>
                      <div className="inp">
                        <input id="pr-u" inputMode="numeric" value={f.undo} onChange={dec('undo')} />
                        <span className="suf">minutes</span>
                      </div>
                    </div>
                  </div>
                  <div className="setrow">
                    <span className="setrow__b">
                      <b>Pay as you read</b>
                      <small>Readers can pay per chapter instead of upfront. Same total, re-reading free.</small>
                    </span>
                    <span className="switch on" role="switch" aria-checked="true" aria-disabled="true" aria-label="Pay as you read"></span>
                  </div>
                  <div className="setrow">
                    <span className="setrow__b">
                      <b>Unlock the next chapter automatically</b>
                      <small>Default for new readers. They can turn it off in the reader.</small>
                    </span>
                    <button
                      className={`switch${f.autoUnlock ? ' on' : ''}`}
                      type="button"
                      role="switch"
                      aria-checked={f.autoUnlock}
                      aria-label="Auto-unlock next chapter"
                      onClick={() => setF(p => ({ ...p, autoUnlock: !p.autoUnlock }))}
                    ></button>
                  </div>
                </div>
              </div>
              <div className="panel">
                <div className="panel__head">
                  <h2>Authors and plans</h2>
                </div>
                <div className="panel__body form">
                  <div className="fgrid">
                    <div className="f">
                      <label htmlFor="pr-a">Author rate</label>
                      <div className="inp">
                        <span className="pre">₦</span>
                        <input id="pr-a" inputMode="decimal" value={f.author} onChange={dec('author')} />
                        <span className="suf">per credit spent</span>
                      </div>
                      <span className="hint">
                        {`${nairaDec(cpp * draft.author_rate_kobo)} a page · ${naira(Math.max(Math.ceil(250 * cpp), 1) * draft.author_rate_kobo)} for a full read of a 250-page book`}
                      </span>
                    </div>
                    <div className="f">
                      <label htmlFor="pr-r">Rollover cap</label>
                      <div className="inp">
                        <input id="pr-r" inputMode="decimal" value={f.rollover} onChange={dec('rollover')} />
                        <span className="suf">plan’s worth</span>
                      </div>
                      <span className="hint">Unused plan credits carry one period while subscribed</span>
                    </div>
                    <div className="f">
                      <label htmlFor="pr-z">Pause instead of cancel</label>
                      <div className="inp">
                        <input id="pr-z" inputMode="numeric" value={f.pause} onChange={dec('pause')} />
                        <span className="suf">months at most</span>
                      </div>
                      <span className="hint">{`Readers can pause for 1 to ${f.pause || '…'} months`}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="stack s20">
              <div className="panel panel--flush">
                <div className="panel__head">
                  <h2>Plan check</h2>
                  <span className="sub">{`After Google Play’s ${rules.store_fee_pct}%`}</span>
                </div>
                {rows.length === 0 ? (
                  <div className="empty" style={{ padding: '40px 24px' }}>
                    <b>No plans to check</b>
                    <span>The plan check shows here once plans are set up.</span>
                  </div>
                ) : (
                  <div className="tw">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Plan</th>
                          <th className="r">Nets a credit</th>
                          <th className="r">Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => (
                          <tr key={r.key}>
                            <td>
                              <b>{r.name}</b>
                              <small className="muted">{`${r.small}${tightest?.key === r.key && rows.length > 1 ? ' · tightest' : ''}`}</small>
                            </td>
                            <td className="n">{nairaDec(r.net)}</td>
                            <td className="n">{nairaDec(r.net - draft.author_rate_kobo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="panel__foot">
                  {planOk
                    ? `Margin is what each credit nets above the ${nairaDec(draft.author_rate_kobo)} author rate. Every plan must stay above zero.`
                    : `A plan no longer earns more than the ${nairaDec(draft.author_rate_kobo)} author rate. Lower the author rate or raise a plan price before you save.`}
                  {tightest && planOk && ` If VAT is withheld, ${tightest.name} nets ${nairaDec(vatNet)}, still ${nairaDec(vatNet - draft.author_rate_kobo)} above.`}
                </div>
              </div>
              <details className="fold">
                <summary>
                  More details <small>change log</small>
                </summary>
                <div className="fold__b">
                  <div className="tl">
                    {dirty && (
                      <div className="tl__i org">
                        <b>{changes.slice(0, 3).join(', ')}</b>
                        <small>Draft · not saved</small>
                      </div>
                    )}
                    {log.map((l, i) => (
                      <div key={i} className={`tl__i ${l.pending ? 'org' : 'ok'}`}>
                        <b>{l.title}</b>
                        <small>{l.small}</small>
                      </div>
                    ))}
                    {!dirty && log.length === 0 && <span className="muted">Saved changes show here.</span>}
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
        {toast}
      </section>
      {confirm && (
        <section className="screen overlay enter">
          <a className="backdrop" aria-label="Close" onClick={() => !pending && setConfirm(null)}></a>
          <div className="modal wide" role="dialog" aria-label="Save pricing rules">
            <div className="modal__h">
              <div className="grow">
                <h2>
                  {confirm.books_changed
                    ? `Change the price of ${num(confirm.books_changed)} book${confirm.books_changed === 1 ? '' : 's'}?`
                    : 'Save these pricing rules?'}
                </h2>
                <p>Takes effect tonight at 00:00 WAT</p>
              </div>
              <button className="ib" type="button" aria-label="Close" onClick={() => !pending && setConfirm(null)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal__b">
              {changes.map(c => {
                const k = (Object.keys(RULE_LABEL) as (keyof Rules)[]).find(key => c.startsWith(RULE_LABEL[key]))!;
                return (
                  <div className="kv-row" key={k}>
                    <span>{RULE_LABEL[k]}</span>
                    <b>{`${ruleValue(k, rules[k])} → ${ruleValue(k, draft[k])}`}</b>
                  </div>
                );
              })}
              <div className="kv-row">
                <span>Books whose price changes</span>
                <b>{num(confirm.books_changed ?? 0)}</b>
              </div>
              {confirm.avg_before != null && confirm.avg_after != null && (
                <div className="kv-row">
                  <span>Average book price</span>
                  <b>{`${num(Math.round(confirm.avg_before))} → ${num(Math.round(confirm.avg_after))} credits`}</b>
                </div>
              )}
              {confirm.biggest && (
                <div className="kv-row">
                  <span>Biggest change</span>
                  <b>{`${confirm.biggest.title}, ${num(confirm.biggest.before ?? 0)} → ${num(confirm.biggest.after)} credits`}</b>
                </div>
              )}
              <div className="kv-row">
                <span>Plan check</span>
                <b>{confirm.plan_check_ok ? `Every plan still above ${nairaDec(draft.author_rate_kobo)}` : 'A plan fails the check'}</b>
              </div>
              <span className="muted">
                Books already unlocked and chapters already paid keep their price. Readers part-way through pay as you read keep the price they started with.
              </span>
              <div className="f">
                <span className="lbl">2-step code</span>
                <Otp value={otp} onChange={setOtp} invalid={!!error} />
                {error && <span className="hint">{error}</span>}
              </div>
            </div>
            <div className="modal__f">
              <button className="btn btn-g" type="button" disabled={pending} onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn-p" type="button" disabled={pending || otp.length !== 6 || !confirm.plan_check_ok} onClick={save}>
                {pending ? 'Saving…' : 'Save rules'}
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
