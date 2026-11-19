'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { setBookPrice, setPreview } from './actions';

type Chapter = { chapter_uid: string; ord: number; pages: number; free: boolean };

/**
 * The "Overrides and promo" fold of s-book-access, plus the confirm modal (flow 03 admin rule 2):
 * price override with a reason (Super admin and Finance, two-step code again) and preview override
 * 5–25% with a reason (Publisher, Super admin). The header's Save changes submits this form.
 */
export function AccessOverrides({
  bookId,
  price,
  computed,
  override,
  previewPercent,
  previewOverride,
  midPaygo,
  canPrice,
  canPreview,
  chapters,
}: {
  bookId: string;
  price: number;
  computed: number;
  override: { credits: number; reason: string } | null;
  previewPercent: number;
  previewOverride: { percent: number; reason: string } | null;
  midPaygo: number;
  canPrice: boolean;
  canPreview: boolean;
  chapters: Chapter[];
}) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [newPrice, setNewPrice] = useState(override ? String(override.credits) : '');
  const [priceReason, setPriceReason] = useState('');
  const [pct, setPct] = useState(String(previewOverride?.percent ?? previewPercent));
  const [pctReason, setPctReason] = useState('');
  const [confirm, setConfirm] = useState<null | 'price' | 'clear'>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const parsed = newPrice.trim() === '' ? null : Number(newPrice);
  const priceChanged = parsed !== (override?.credits ?? null) && !(parsed === computed && !override);
  const pctNum = Number(pct);
  const pctChanged = pct.trim() !== '' && pctNum !== Number(previewOverride?.percent ?? previewPercent);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Check both edits first, so a form with a new price and a new preview saves both.
    if (priceChanged) {
      if (!canPrice) return show('Only Super admins and Finance can change prices.');
      if (!priceReason.trim()) return show('Add a reason for the new price. It goes in the price history.');
    }
    if (pctChanged) {
      if (!canPreview) return show('Only Publishers and Super admins can change the preview.');
      if (!pctReason.trim()) return show('Add a reason for the new preview. It goes in the audit log.');
    }
    if (priceChanged) {
      setCode('');
      return setConfirm(parsed === null || parsed === computed ? 'clear' : 'price');
    }
    if (pctChanged) {
      return start(async () => {
        const r = await savePreview();
        if (!r.ok) return show(r.error);
        show(r.message);
        router.refresh();
      });
    }
    show('Nothing to save. Change the price or the preview first.');
  };

  const savePreview = async () => {
    // Back to the revision's own preview removes the override.
    const r = await setPreview(bookId, pctNum === previewPercent ? null : pctNum, pctReason, previewPercent);
    if (r.ok) setPctReason('');
    return r;
  };

  const save = () =>
    start(async () => {
      const r = await setBookPrice(
        bookId,
        confirm === 'clear' ? null : parsed,
        priceReason,
        code,
        chapters,
        computed,
      );
      if (!r.ok) return setError(r.error);
      setConfirm(null);
      setPriceReason('');
      if (pctChanged) {
        const p = await savePreview();
        show(p.ok ? `${r.message} ${p.message}` : `${r.message} The preview didn't save: ${p.error}`);
      } else show(r.message);
      router.refresh();
    });

  const to = confirm === 'clear' ? computed : (parsed ?? computed);
  return (
    <>
      <form id="access-form" onSubmit={submit}>
        <details className="fold">
          <summary>
            Overrides and promo <small>price, preview percent</small>
          </summary>
          <div className="fold__b">
            <div className="fgrid">
              <div className="f">
                <label htmlFor="ac-price">Price override</label>
                <div className={`inp${canPrice ? '' : ' ro'}`}>
                  <input
                    id="ac-price"
                    inputMode="numeric"
                    value={newPrice}
                    placeholder={String(computed)}
                    readOnly={!canPrice}
                    onChange={e => setNewPrice(e.target.value.replace(/[^\d]/g, ''))}
                  />
                  <span className="suf">credits</span>
                </div>
                <span className="hint">
                  {canPrice ? `Leave empty to use the computed ${computed}` : 'Super admin and Finance only'}
                </span>
              </div>
              <div className="f">
                <label htmlFor="ac-price-r">Reason for price</label>
                <div className="inp">
                  <input
                    id="ac-price-r"
                    value={priceReason}
                    placeholder={override?.reason ?? ''}
                    readOnly={!canPrice}
                    onChange={e => setPriceReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="f">
                <label htmlFor="ac-pct">Preview percent</label>
                <div className={`inp${canPreview ? '' : ' ro'}`}>
                  <input
                    id="ac-pct"
                    inputMode="decimal"
                    value={pct}
                    readOnly={!canPreview}
                    onChange={e => setPct(e.target.value.replace(/[^\d.]/g, ''))}
                    aria-label="Preview percent"
                  />
                  <span className="suf">%</span>
                </div>
              </div>
              <div className="f">
                <label htmlFor="ac-pct-r">Reason for override</label>
                <div className="inp">
                  <input
                    id="ac-pct-r"
                    value={pctReason}
                    placeholder={previewOverride?.reason ?? ''}
                    readOnly={!canPreview}
                    onChange={e => setPctReason(e.target.value)}
                  />
                </div>
                <span className="hint">{`5% to 25%. Leave at ${previewPercent}% to keep the default`}</span>
              </div>
            </div>
          </div>
        </details>
      </form>
      {confirm && (
        <section className="screen overlay enter">
          <a className="backdrop" aria-label="Close" onClick={() => !pending && setConfirm(null)}></a>
          <div className="modal" role="dialog" aria-label="Change the price?">
            <div className="modal__h">
              <div className="grow">
                <h2>{confirm === 'clear' ? 'Remove the price override?' : 'Change the price?'}</h2>
                <p>{`${price} credits → ${to} credits. ${midPaygo.toLocaleString('en-NG')} reader${midPaygo === 1 ? ' is' : 's are'} paying as they read; they pay at most ${to} minus what they already paid.`}</p>
              </div>
              <button className="ib" type="button" aria-label="Close" onClick={() => !pending && setConfirm(null)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal__b">
              <div className="f">
                <label htmlFor="ac-code">Two-step code</label>
                <div className="inp">
                  <input
                    id="ac-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    autoFocus
                    onChange={e => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                  />
                </div>
                <span className="hint">{error ?? 'Price changes need your authenticator code again.'}</span>
              </div>
            </div>
            <div className="modal__f">
              <button className="btn btn-g" type="button" disabled={pending} onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn-p" type="button" disabled={pending || code.length !== 6} onClick={save}>
                {confirm === 'clear' ? `Use ${to} credits` : `Change to ${to} credits`}
              </button>
            </div>
          </div>
        </section>
      )}
      {toast}
    </>
  );
}
