'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import {
  bannerAudienceLabel,
  dayMonth,
  PLACEMENT_LABEL,
  rankOf,
  STATE_LABEL,
  type Banner,
  type BannerState,
} from './labels';

const TABS: BannerState[] = ['live', 'scheduled', 'ended', 'draft'];
const num = (n: number) => n.toLocaleString('en-NG');

/** s-banners. */
export function BannersView({
  rows,
  genres,
  canEdit,
  done,
}: {
  rows: Banner[] | null;
  genres: Record<string, string>;
  canEdit: boolean;
  done?: string;
}) {
  const router = useRouter();
  const all = rows ?? [];
  const count = (s: BannerState) => all.filter(b => b.live_state === s).length;
  const [tab, setTab] = useState<BannerState>(() => (count('live') || !all.length ? 'live' : TABS.find(t => count(t))!));
  const [toastNode, showToast] = useToast();

  useEffect(() => {
    if (!done) return;
    showToast(done);
    window.history.replaceState(null, '', '/banners');
  }, [done, showToast]);

  const shown = all.filter(b => b.live_state === tab);

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>In-app announcements</h1>
          </div>
          {canEdit ? (
            <div className="band__acts">
              <Link className="btn btn-n" href="/banners/new">
                <Icon name="plus" />
                New announcement
              </Link>
            </div>
          ) : null}
        </div>
      </div>
      <div className="page">
        <div className="toolbar" role="tablist">
          {TABS.map(t => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? 'fchip is-selected' : 'fchip'}
              onClick={() => setTab(t)}
            >
              {STATE_LABEL[t]} <span className="c">{count(t)}</span>
            </button>
          ))}
        </div>
        <div className="panel panel--flush">
          {!rows ? (
            <div className="empty">
              <b>Announcements didn&apos;t load</b>
              <span>Check your connection and refresh the page.</span>
            </div>
          ) : shown.length === 0 ? (
            <div className="empty">
              <b>{all.length ? `No ${STATE_LABEL[tab].toLowerCase()} announcements` : 'No announcements yet'}</b>
              <span>
                {all.length
                  ? 'Pick another tab to see the rest.'
                  : 'Put a card on Home, a note on the Credits page or a modal when the app opens.'}
              </span>
              {canEdit && !all.length ? (
                <div className="row">
                  <Link className="btn btn-p" href="/banners/new">
                    New announcement
                  </Link>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Announcement</th>
                    <th>Dates</th>
                    <th className="r">Priority</th>
                    <th className="r">Shown</th>
                    <th className="r">Taps</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(b => (
                    <tr key={b.id} onClick={() => router.push(`/banners/${b.id}`)}>
                      <td>
                        <b>{b.headline || 'Untitled announcement'}</b>
                        <br />
                        <small className="faint">
                          {[
                            PLACEMENT_LABEL[b.placement],
                            bannerAudienceLabel(b.audience, genres),
                            b.button_label ? `Button: ${b.button_label}` : null,
                            b.placement === 'launch_modal' && b.dismissible ? 'can be dismissed' : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      </td>
                      <td className={b.starts_at || b.ends_at ? 'nw' : 'nw muted'}>
                        {b.starts_at && b.ends_at
                          ? `${dayMonth(b.starts_at)} to ${dayMonth(b.ends_at)}`
                          : b.starts_at
                            ? `From ${dayMonth(b.starts_at)}`
                            : b.ends_at
                              ? `Until ${dayMonth(b.ends_at)}`
                              : 'No dates'}
                      </td>
                      <td className="n">{rankOf(b.priority)}</td>
                      <td className={b.shown ? 'n' : 'n muted'}>{num(b.shown)}</td>
                      <td className={b.taps ? 'n' : 'n muted'}>
                        {num(b.taps)}
                        {b.tap_rate != null && b.taps ? (
                          <>
                            {' '}
                            <small className="faint">{`(${b.tap_rate.toFixed(1)}%)`}</small>
                          </>
                        ) : null}
                      </td>
                      <td>
                        <span className="st-plain">{STATE_LABEL[b.live_state]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pager">
            <span>{`${all.length} ${all.length === 1 ? 'announcement' : 'announcements'}`}</span>
            <span>Home top allows 2 at once, Modal on launch allows 1 per reader per day</span>
          </div>
        </div>
      </div>
      {toastNode}
    </section>
  );
}
