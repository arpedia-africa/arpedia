'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { setPromoStatus } from './actions';

export interface PromoRow {
  code: string;
  type: string;
  value: string;
  uses: string;
  expires: string;
  status: string;
  group: 'active' | 'scheduled' | 'paused' | 'expired';
}

type Filter = 'all' | PromoRow['group'];

/** s-promos: filter chips and the table. Pause or resume sits at the end of each row (rule 34). */
export function PromosList({ rows, flash }: { rows: PromoRow[]; flash: string | null }) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!flash) return;
    show(flash);
    router.replace('/promos', { scroll: false });
  }, [flash, router, show]);

  const count = (g: PromoRow['group']) => rows.filter(r => r.group === g).length;
  const chips: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: rows.length },
    { key: 'active', label: 'Active', n: count('active') },
    { key: 'scheduled', label: 'Scheduled', n: count('scheduled') },
    ...(count('paused') ? [{ key: 'paused' as const, label: 'Paused', n: count('paused') }] : []),
    { key: 'expired', label: 'Expired', n: count('expired') },
  ];
  const shown = filter === 'all' ? rows : rows.filter(r => r.group === filter);

  const toggle = (r: PromoRow) =>
    start(async () => {
      const next = r.group === 'paused' ? 'active' : 'paused';
      const res = await setPromoStatus(r.code, next);
      if (!res.ok) return show(res.error);
      show(`${r.code.toUpperCase()} ${next === 'paused' ? 'paused. Nobody can use it until you resume it.' : 'is active again.'}`);
      router.refresh();
    });

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Promo codes</h1>
          </div>
          <div className="band__acts">
            <Link className="btn btn-n" href="/promos/new">
              <Icon name="plus" />
              New promo code
            </Link>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="toolbar">
          <div className="row" data-single>
            {chips.map(c => (
              <button
                key={c.key}
                type="button"
                className={`fchip${filter === c.key ? ' is-selected' : ''}`}
                onClick={() => setFilter(c.key)}
              >
                {c.label} <span className="c">{c.n}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="panel panel--flush">
          {shown.length === 0 ? (
            <div className="empty" style={{ padding: '64px 24px' }}>
              <b>{rows.length === 0 ? 'No promo codes yet' : 'No codes here'}</b>
              <span>
                {rows.length === 0
                  ? 'Make a code for bonus credits, a web plan discount or free trial days.'
                  : 'Pick another filter to see the rest.'}
              </span>
              {rows.length === 0 && (
                <Link className="btn btn-p" href="/promos/new">
                  New promo code
                </Link>
              )}
            </div>
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Value</th>
                    <th className="r">Uses / limit</th>
                    <th>Expires</th>
                    <th>Status</th>
                    <th className="acts"></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(r => (
                    <tr key={r.code}>
                      <td>
                        <div className="who">
                          <span>
                            <b className="mono">{r.code.toUpperCase()}</b>
                            <small>{r.type}</small>
                          </span>
                        </div>
                      </td>
                      <td>{r.value}</td>
                      <td className="n">{r.uses}</td>
                      <td className="nw">{r.expires}</td>
                      <td>
                        <span className="st-plain">{r.status}</span>
                      </td>
                      <td className="acts">
                        {(r.group === 'active' || r.group === 'scheduled' || r.group === 'paused') && (
                          <button className="btn btn-g sm" type="button" disabled={pending} onClick={() => toggle(r)}>
                            {r.group === 'paused' ? 'Resume' : 'Pause'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {toast}
    </section>
  );
}
