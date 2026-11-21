import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/icon';
import { NoAccess } from '@/components/no-access';
import { serverSupabase } from '@/lib/supabase/server';
import { clock, date, dayMonth, initials, waited } from '../../books/shared';
import { LATE_DAYS, avClass, gate, n0 } from '../../authors/shared';
import { AssignMe } from '../assign';
import { DecideBar, SampleButton } from './client';

/** Similarity from this share of the sample counts as a failed check (it never rejects by itself). */
const SIMILARITY_FLAG = 30;

interface Checks {
  email_verified?: boolean;
  phone_verified?: boolean;
  duplicate?: boolean;
  duplicate_count?: number;
  similarity_pct?: number | null;
  similarity_failed?: boolean;
  age?: number | null;
  age_ok?: boolean;
}

type State = 'pass' | 'fail' | 'na';
interface Check {
  name: string;
  sub: string;
  result: string;
  state: State;
}

/** The five automatic checks (rule 10), each with what it found. A failed one is highlighted, never an auto-reject. */
function checkList(c: Checks, a: { email: string; phone: string | null }): Check[] {
  const sim = c.similarity_pct;
  return [
    {
      name: 'Email verified',
      sub: a.email,
      result: c.email_verified ? 'Pass' : 'Not verified',
      state: c.email_verified ? 'pass' : 'fail',
    },
    a.phone
      ? {
          name: 'Phone verified',
          sub: 'Code confirmed on the account',
          result: c.phone_verified ? 'Pass' : 'Not verified',
          state: c.phone_verified ? 'pass' : 'fail',
        }
      : { name: 'Phone verified', sub: 'The applicant did not give a phone number', result: 'Not given', state: 'na' },
    {
      name: 'Duplicate account',
      sub: c.duplicate
        ? 'Another application has the same email, phone or name'
        : 'No matching email, phone or name',
      result: c.duplicate ? `${n0(c.duplicate_count ?? 1)} found` : 'None found',
      state: c.duplicate ? 'fail' : 'pass',
    },
    c.similarity_failed
      ? { name: 'Copied text in sample', sub: 'The check could not read the sample', result: 'Not checked', state: 'na' }
      : sim == null
        ? { name: 'Copied text in sample', sub: 'Runs soon after the application is sent', result: 'Not checked yet', state: 'na' }
        : sim >= SIMILARITY_FLAG
          ? { name: 'Copied text in sample', sub: `${sim}% similar to other writing we hold`, result: 'Look closely', state: 'fail' }
          : {
              name: 'Copied text in sample',
              sub: `${sim}% similarity, only common phrases`,
              result: 'OK',
              state: 'pass',
            },
    c.age == null
      ? { name: 'Age 18 or over', sub: 'No date of birth on the application', result: 'Not checked', state: 'na' }
      : { name: 'Age 18 or over', sub: `Age ${c.age}`, result: c.age_ok ? 'OK' : 'Under 18', state: c.age_ok ? 'pass' : 'fail' },
  ];
}

const age = (dob: string) => {
  const d = new Date(dob);
  const t = new Date();
  let y = t.getFullYear() - d.getFullYear();
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) y--;
  return y;
};

const maskPhone = (p: string) => (p.length > 9 ? `${p.slice(0, 4)} ${p.slice(4, 7)} ••• ••${p.slice(-2)}` : p);

/** Cut at a word boundary, for the clamped bio. */
function clamp(text: string, max: number) {
  if (text.length <= max) return null;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : max)}…`;
}

const STATUS = { draft: 'Draft', new: 'New', needs_info: 'Needs more info', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn' } as const;

const EVENT: Record<string, (who: string, note: string | null) => string> = {
  submitted: () => 'Application submitted',
  assigned: (who, note) => `Assigned to ${note ?? 'a reviewer'} by ${who}`,
  info_asked: who => `More info asked by ${who}`,
  info_given: () => 'Applicant replied with more info',
  approved: who => `Approved by ${who}`,
  rejected: who => `Rejected by ${who}`,
};

/** Application (s-application): five steps of answers, automatic checks, reviewer notes and the decision bar. */
export async function ApplicationView({ id }: { id: string }) {
  const g = await gate();
  if ('denied' in g) return g.denied;
  const supabase = await serverSupabase();
  const [{ data: a, error }, { data: events }, { data: queue }, { data: rawChecks }] = await Promise.all([
    supabase
      .from('author_applications')
      .select(
        `id, status, step_reached, legal_name, email, phone, pen_name, social_handle, date_of_birth, state,
         categories, bio, experience, sample_file_key, sample_file_name, sample_text, sample_pages, sample_excerpt,
         agreement_version, agreement_accepted_at, submitted_at, decided_at,
         assignee:profiles!author_applications_assigned_to_fkey(full_name)`,
      )
      .eq('id', id)
      .neq('status', 'draft')
      .maybeSingle(),
    supabase
      .from('author_application_events')
      .select('id, kind, note, created_at, actor:profiles!author_application_events_actor_id_fkey(full_name)')
      .eq('application_id', id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }),
    supabase
      .from('author_applications')
      .select('id')
      .in('status', ['new', 'needs_info'])
      .order('submitted_at', { ascending: true }),
    // Review internals aren't selectable from the table (applicants would see them).
    supabase.rpc('admin_application_checks', { p_app: id }),
  ]);
  if (error?.code === '42501') return <NoAccess page="applications" label="Authors and applications" role={g.staff.role} />;
  if (error) throw error;
  if (!a) notFound();

  const name = a.pen_name || a.legal_name;
  const open = a.status === 'new' || a.status === 'needs_info';
  const days = a.submitted_at ? (Date.now() - new Date(a.submitted_at).getTime()) / 86_400_000 : 0;
  const late = open && days > LATE_DAYS;
  const ids = (queue ?? []).map(q => q.id);
  const at = ids.indexOf(id);
  const next = ids.length > 1 ? ids[(Math.max(at, 0) + 1) % ids.length]! : null;
  const checks = (rawChecks ?? {}) as Checks;
  const ran = Object.keys(checks).length > 0;
  const list = ran ? checkList(checks, a) : [];
  const bad = list.filter(c => c.state === 'fail').length;
  const na = list.filter(c => c.state === 'na').length;
  const ok = list.length - bad - na;
  const excerpt = (a.sample_excerpt ?? a.sample_text ?? '').trim();
  const words = a.sample_text ? a.sample_text.trim().split(/\s+/).filter(Boolean).length : null;
  const shortBio = clamp(a.bio, 200);
  const notes = (events ?? []).filter(e => e.note && e.kind !== 'assigned');
  const done = a.step_reached >= 4 || a.status !== 'draft';
  const meta = [
    <span key="s">{STATUS[a.status]}</span>,
    a.submitted_at && <span key="d">{`Submitted ${date(a.submitted_at)}`}</span>,
    open && a.submitted_at && (
      <span key="w" className={late ? 'pp-late' : undefined}>{`Waiting ${waited(a.submitted_at)} (promise ${LATE_DAYS})`}</span>
    ),
    a.decided_at && <span key="dc">{`${a.status === 'approved' ? 'Approved' : 'Rejected'} ${date(a.decided_at)}`}</span>,
    a.categories.length > 0 && <span key="c">{a.categories.join(', ')}</span>,
    a.state && <span key="st">{a.state}</span>,
  ].filter(Boolean);

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <Link href="/applications">Applications</Link>
          <Icon name="chev" size="s" />
          <span>{name}</span>
        </div>
        <div className="ph__row">
          <span className={`av lg ${avClass(a.id)}`}>{initials(name)}</span>
          <div className="ph__title">
            <h1>{name}</h1>
            <div className="ph__meta">{meta}</div>
          </div>
          {open && (
            <div className="ph__acts">
              {a.assignee?.full_name ? (
                <span className="muted">{`On it: ${a.assignee.full_name}`}</span>
              ) : (
                <AssignMe id={a.id} name={name} button />
              )}
            </div>
          )}
        </div>
      </div>
      <div className="page">
        <div className="split split--wide">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Application steps</h2>
                <span className="sub">{done ? 'All 5 submitted' : `${a.step_reached} of 5 done`}</span>
              </div>
              <div className="panel__body">
                <div className="steps">
                  {[1, 2, 3, 4, 5].map(n => (
                    <span key={n} className={done ? 'ok' : undefined}></span>
                  ))}
                </div>
                <div className="stepper">
                  <div className="stp ok">
                    <i>1</i>
                    <div className="grow">
                      <b>Personal details</b>
                      <dl className="pp-ans">
                        <dt>Legal name</dt>
                        <dd>{a.legal_name}</dd>
                        {a.pen_name && (
                          <>
                            <dt>Pen name</dt>
                            <dd>{a.pen_name}</dd>
                          </>
                        )}
                        <dt>Phone</dt>
                        <dd>{a.phone ? maskPhone(a.phone) : 'Not given'}</dd>
                        <dt>Email</dt>
                        <dd>{a.email}</dd>
                        <dt>State</dt>
                        <dd>{a.state ?? 'Not given'}</dd>
                        <dt>Date of birth</dt>
                        <dd>{a.date_of_birth ? `${date(a.date_of_birth)} (age ${age(a.date_of_birth)})` : 'Not given'}</dd>
                      </dl>
                    </div>
                  </div>
                  <div className="stp ok">
                    <i>2</i>
                    <div className="grow">
                      <b>About you</b>
                      <p>{shortBio ?? a.bio}</p>
                      {shortBio && (
                        <details className="pp-more">
                          <summary>Read the full bio</summary>
                          <p>{a.bio}</p>
                        </details>
                      )}
                    </div>
                  </div>
                  <div className="stp ok">
                    <i>3</i>
                    <div className="grow">
                      <b>Genres and writing</b>
                      <dl className="pp-ans">
                        <dt>Genres</dt>
                        <dd>{a.categories.join(', ') || 'None picked'}</dd>
                        <dt>Writing experience</dt>
                        <dd>{a.experience || 'Not given'}</dd>
                        {a.social_handle && (
                          <>
                            <dt>Social handle</dt>
                            <dd>{a.social_handle}</dd>
                          </>
                        )}
                      </dl>
                    </div>
                  </div>
                  <div className="stp ok">
                    <i>4</i>
                    <div className="grow">
                      <b>Writing sample</b>
                      {a.sample_file_key || a.sample_text || a.sample_file_name ? (
                        <div className="file">
                          <span className="grow">
                            <b>{a.sample_file_name ?? 'Pasted text'}</b>
                            <small>
                              {[
                                a.sample_pages ? `${a.sample_pages} page${a.sample_pages === 1 ? '' : 's'}` : null,
                                words ? `${n0(words)} words` : null,
                                a.submitted_at ? `sent ${dayMonth(a.submitted_at)}` : null,
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'Sent with the application'}
                            </small>
                          </span>
                          {a.sample_file_key && <SampleButton id={a.id} name={a.sample_file_name ?? 'the sample'} />}
                        </div>
                      ) : (
                        <span className="muted">No sample was attached.</span>
                      )}
                      {excerpt && (
                        <details className="pp-more">
                          <summary>Read the excerpt</summary>
                          <div className="pp-sample">
                            {excerpt
                              .slice(0, 1500)
                              .split(/\n{2,}/)
                              .filter(Boolean)
                              .map((p, i) => (
                                <p key={i}>{p}</p>
                              ))}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                  <div className="stp ok">
                    <i>5</i>
                    <div className="grow">
                      <b>Payout and agreement</b>
                      <dl className="pp-ans">
                        <dt>Author agreement</dt>
                        <dd>
                          {a.agreement_version && a.agreement_accepted_at
                            ? `Version ${a.agreement_version} accepted on ${date(a.agreement_accepted_at)}, ${clock(a.agreement_accepted_at)}`
                            : 'Not accepted yet'}
                        </dd>
                        <dt>Bank account</dt>
                        <dd>To be added in Author Studio after approval</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="stack s20">
            <div className="sline">
              <span className={`dot${bad || !ran ? ' warn' : ''}`}></span>
              <b>
                {!ran
                  ? 'Checks have not run yet'
                  : bad
                    ? `${bad} of ${list.length} checks need a look`
                    : na
                      ? `${ok} of ${list.length} checks passed, ${na} not checked`
                      : `All ${list.length} checks passed`}
              </b>
            </div>
            <details className="fold" open={bad > 0}>
              <summary>
                Check details <small>email, phone, duplicates, copied text, age</small>
              </summary>
              <div className="fold__b">
                {list.length === 0 ? (
                  <span className="muted">The checks run when the application is sent. Reload in a minute.</span>
                ) : (
                  list.map(c => (
                    <div className="pp-chk" key={c.name}>
                      <span>
                        {c.name}
                        <small>{c.sub}</small>
                      </span>
                      <span className={c.state === 'fail' ? 'pp-late' : c.state === 'na' ? 'muted' : undefined}>{c.result}</span>
                    </div>
                  ))
                )}
              </div>
            </details>
            <div className="panel">
              <div className="panel__head">
                <h2>Reviewer notes</h2>
              </div>
              <div className="panel__body">
                {notes.length === 0 ? (
                  <span className="muted">No notes yet. Questions and decisions show here with the reason.</span>
                ) : (
                  notes.map(e => (
                    <div className="pp-note" key={e.id}>
                      <span>
                        <b>{e.actor?.full_name ?? 'Arpedia'}</b> · {dayMonth(e.created_at)}
                      </span>
                      {e.note}
                    </div>
                  ))
                )}
              </div>
            </div>
            <details className="fold">
              <summary>
                History <small>{`${(events ?? []).length} event${(events ?? []).length === 1 ? '' : 's'}`}</small>
              </summary>
              <div className="fold__b">
                {(events ?? []).length === 0 ? (
                  <span className="muted">Nothing has happened yet.</span>
                ) : (
                  <div className="tl">
                    {(events ?? []).map(e => (
                      <div className={`tl__i${e.kind === 'approved' ? ' ok' : e.kind === 'info_asked' ? ' org' : ''}`} key={e.id}>
                        <b>{EVENT[e.kind]?.(e.actor?.full_name ?? 'Arpedia', e.note) ?? e.kind}</b>
                        <small>{`${dayMonth(e.created_at)}, ${clock(e.created_at)}`}</small>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </div>
        </div>
      </div>
      <DecideBar id={a.id} position={at + 1} total={ids.length} skipHref={next ? `/applications/${next}` : '/applications'} status={a.status} />
    </section>
  );
}
