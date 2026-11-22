import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { ReaderActions, SignOutDevice } from '../../reader-actions';
import { ReaderHeader, lastSeen } from '../../shared';
import { loadReader, readerRights } from '../data';

export const metadata: Metadata = { title: 'Reader: Reading and devices · Arpedia Admin' };

const hm = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;

/** People · Reader: Reading and devices (s-user-activity). */
export default async function ReaderActivity({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaff();
  if (!canOpen('users', staff.permissions)) return <NoAccess page="users" label="Readers" role={staff.role} />;
  const r = await loadReader(id);
  const rights = readerRights(staff);
  const devices = r.devices.filter(d => !d.revoked_at);
  const firstName = r.name.split(' ')[0] || 'The reader';
  const minutes = r.reading_minutes_30d;

  return (
    <section className="screen enter">
      <ReaderHeader
        r={r}
        tab="activity"
        actions={
          <ReaderActions id={r.id} name={r.name} isAuthor={r.is_author} deleted={!!r.deleted_at} devices={devices.length} {...rights} />
        }
      />
      <div className="page">
        <div className="split">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Currently reading</h2>
              </div>
              <div className="panel__body">
                {r.reading.length ? (
                  r.reading.map((b, i) => (
                    <div className="pp-read" key={b.book_id}>
                      <span className={`cv c${(i % 6) + 1} x40`}></span>
                      <div>
                        <b>{b.title}</b>
                        <div className="hint">{`Last opened ${lastSeen(b.last_opened_at)}`}</div>
                        <div className="meter">
                          <i style={{ ['--v' as string]: `${b.percent}%` }}></i>
                        </div>
                      </div>
                      <b className="n">{`${Math.round(b.percent)}%`}</b>
                    </div>
                  ))
                ) : (
                  <span className="muted">Not reading anything right now.</span>
                )}
              </div>
            </div>
            <div className="panel">
              <div className="panel__head">
                <h2>Reading time, last 30 days</h2>
                <span className="sub">
                  {minutes == null ? 'Shows once reading sessions are recorded' : `${hm(minutes)} total · ${hm(Math.round(minutes / 30))} a day`}
                </span>
              </div>
            </div>
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>Devices and sessions</h2>
                <span className="sub">{`${devices.length} signed in`}</span>
              </div>
              {devices.length ? (
                <div className="tw">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Device</th>
                        <th>App version</th>
                        <th>Last seen</th>
                        <th>City</th>
                        <th className="acts"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {devices.map((d, i) => (
                        <tr key={d.id}>
                          <td>
                            <b>{[d.model ?? 'Unknown device', d.os].filter(Boolean).join(' · ')}</b>
                            {i === 0 && (
                              <>
                                <br />
                                <span className="hint">Most recent</span>
                              </>
                            )}
                          </td>
                          <td className="nw">{d.app_version ?? '—'}</td>
                          <td className="nw">{lastSeen(d.last_seen_at)}</td>
                          <td className="nw">{d.city ?? 'Unknown'}</td>
                          <td className="acts">
                            {rights.canAct && (
                              <SignOutDevice id={r.id} device={d.id} model={d.model ?? 'Device'} firstName={firstName} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty" style={{ padding: '32px 24px' }}>
                  <b>No devices signed in</b>
                  <span>{`${firstName} is signed out everywhere.`}</span>
                </div>
              )}
            </div>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Library and notes</h2>
              </div>
              <div className="panel__body">
                <div className="pp-cnt">
                  <div>
                    <b>{r.unlocked.length}</b>Unlocked
                  </div>
                  <div>
                    <b>{r.counts.books_read}</b>Finished
                  </div>
                  <div>
                    <b>{devices.filter(d => d.download_enabled).length}</b>Download devices
                  </div>
                </div>
                <div className="pp-cnt">
                  <div>
                    <b>{r.counts.highlight}</b>Highlights
                  </div>
                  <div>
                    <b>{r.counts.note}</b>Notes
                  </div>
                  <div>
                    <b>{r.counts.bookmark}</b>Bookmarks
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
