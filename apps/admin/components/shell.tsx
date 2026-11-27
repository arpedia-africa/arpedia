'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { locate, type NavSection } from '@/lib/nav';
import { searchTerm, type SearchHit } from '@/lib/search';
import { searchRecords, type SearchResult } from '@/lib/search-actions';
import { Icon } from './icon';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]!.toUpperCase())
    .join('');

export interface ShellProps {
  staff: { name: string; roleLabel: string };
  /** The sidebar for this staff member's role (navFor): links the role cannot use are hidden. */
  nav: NavSection[];
  env: string;
  children: ReactNode;
}

/** Every console page the role can open, for the search overlay (s-cmdk). */
const pagesOf = (nav: NavSection[]) =>
  nav.flatMap(sec =>
    sec.sub.length
      ? sec.sub.map(s => ({ label: s.label, section: sec.label, href: `/${s.key}` }))
      : [{ label: sec.label, section: sec.label, href: sec.href }],
  );
type Page = ReturnType<typeof pagesOf>[number];

/**
 * Console shell: the same markup and class names as admin/src/02-shell.html, styled by the
 * prototype's own CSS (app/prototype.css). Nav state follows the prototype script: the current
 * page gets aria-current="page" and its section gets "open".
 */
export function Shell({ staff, nav, env, children }: ShellProps) {
  const pathname = usePathname();
  const { section: openSection, page } = locate(pathname);
  const pages = useMemo(() => pagesOf(nav), [nav]);
  const [sideOpen, setSideOpen] = useState(false);
  const [search, setSearch] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch(v => !v);
      }
      if (e.key === 'Escape') {
        setSideOpen(false);
        setSearch(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setSideOpen(false);
    setSearch(false);
  }, [pathname]);

  const envLabel = env === 'production' ? 'Production' : env === 'staging' ? 'Staging' : 'Local';

  return (
    <div className="console">
      <aside className={sideOpen ? 'side open' : 'side'} aria-label="Admin navigation">
        <div className="side__brand">
          <img src="/brand/mark.png" width={32} height={32} alt="" />
          <div>
            <span className="wmk wmk--light" role="img" aria-label="arpedia" style={{ height: 22 }} />
            <small style={{ marginTop: 4 }}>Admin console</small>
          </div>
        </div>
        <div className="env">
          <span className="dot" />
          <span>
            <b>{envLabel}</b> · admin.arpedia.africa
          </span>
        </div>
        <nav className="side__nav">
          {nav.map(sec => {
            const open = sec.key === openSection?.key;
            return (
              <div key={sec.key} className={open && sec.sub.length ? 'side__sec open' : 'side__sec'}>
                <Link
                  href={sec.href}
                  className="side__item"
                  aria-current={open && sec.sub.length === 0 ? 'page' : undefined}
                >
                  <Icon name={sec.icon} />
                  {sec.label}
                </Link>
                {sec.sub.length ? (
                  <div className="side__sub">
                    {sec.sub.map(s => (
                      <Link key={s.key} href={`/${s.key}`} aria-current={page?.key === s.key ? 'page' : undefined}>
                        {s.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        <Link className="side__me" href="/account" aria-current={pathname === '/account' ? 'page' : undefined}>
          <span className="av sm g">{initials(staff.name)}</span>
          <span>
            <b>{staff.name}</b>
            <small>{staff.roleLabel}</small>
          </span>
        </Link>
      </aside>

      <div className="workspace">
        <div className="topbar">
          <button className="ib topmenu" aria-label="Open navigation" onClick={() => setSideOpen(v => !v)}>
            <Icon name="menu" />
          </button>
          <a
            className="gsearch"
            href="#search"
            onClick={e => {
              e.preventDefault();
              setSearch(true);
            }}
          >
            <Icon name="search" size="s" />
            <span>Search readers, books, authors, payments</span>
            <kbd>Ctrl K</kbd>
          </a>
          <span className="spacer" />
          {/* Opens the Books pipeline; the upload form itself arrives with flow 12. */}
          <Link href="/books" className="btn btn-g sm">
            <Icon name="plus" size="xs" />
            New book
          </Link>
          {/* Staff alerts arrive with the flows that raise them (flow 16 sets who gets which). */}
          <Link className="ib" href="/account" aria-label="Staff alerts">
            <Icon name="bell" />
          </Link>
          <Link className="ib" href="/help" aria-label="Help">
            <Icon name="help" />
          </Link>
        </div>
        <main className="view">
          {children}
          {search ? <Search pages={pages} onClose={() => setSearch(false)} /> : null}
        </main>
      </div>
    </div>
  );
}

/** One row of the search overlay: a record (reader, author, book, payment) or a console page. */
interface Row {
  href: string;
  title: string;
  detail?: string;
  trail: string;
  avatar?: SearchHit['avatar'];
}

/**
 * s-cmdk: search overlay. Records (readers, authors, books, payments) come from searchRecords,
 * only in the groups this role can open; console pages are matched here.
 */
function Search({ pages, onClose }: { pages: Page[]; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [found, setFound] = useState<{ q: string; result: SearchResult } | null>(null);
  const [lostAt, setLostAt] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const term = searchTerm(q);

  const pageHits = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? pages.filter(p => `${p.section} ${p.label}`.toLowerCase().includes(t)) : pages;
  }, [q, pages]);

  // Records: a short pause after typing, and only the answer for the latest query is kept.
  useEffect(() => {
    if (!term) return;
    let live = true;
    const timer = setTimeout(() => {
      if (!navigator.onLine) {
        setLostAt(term);
        return;
      }
      setLostAt(null);
      searchRecords(term)
        .then(result => live && setFound({ q: term, result }))
        .catch(() => live && setFound({ q: term, result: { groups: [], failed: true } }));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [term]);

  const fresh = term && found?.q === term ? found.result : null;
  const offline = !!term && lostAt === term;
  const loading = !!term && !fresh && !offline;
  const groups: { label: string; rows: Row[] }[] = [
    ...(term && fresh ? fresh.groups.map(g => ({ label: g.label, rows: g.hits as Row[] })) : []),
    ...(pageHits.length
      ? [{ label: 'Pages', rows: pageHits.map(p => ({ href: p.href, title: p.label, trail: p.section })) }]
      : []),
  ];
  const rows = groups.flatMap(g => g.rows);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => setActive(0), [q]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  let n = 0;
  return (
    <section className="screen overlay enter">
      <a
        className="backdrop"
        href="#close"
        aria-label="Close search"
        onClick={e => {
          e.preventDefault();
          onClose();
        }}
      />
      <div className="cmdk" role="dialog" aria-label="Search">
        <div className="cmdk__in">
          <Icon name="search" />
          <input
            ref={input}
            value={q}
            aria-label="Search"
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') setActive(i => Math.min(i + 1, rows.length - 1));
              else if (e.key === 'ArrowUp') setActive(i => Math.max(i - 1, 0));
              else if (e.key === 'Enter' && rows[active]) go(rows[active].href);
              else return;
              e.preventDefault();
            }}
          />
          <span className="kbd">Esc</span>
        </div>
        {groups.map(g => (
          <Fragment key={g.label}>
            <div className="cmdk__grp">{g.label}</div>
            {g.rows.map(r => {
              const i = n++;
              return (
                <Link
                  key={r.href}
                  className={i === active ? 'li is-active' : 'li'}
                  href={r.href}
                  onClick={onClose}
                  onMouseMove={() => setActive(i)}
                >
                  {r.avatar ? <span className={`av sm ${r.avatar.tone}`}>{r.avatar.text}</span> : null}
                  <span className="li__body">
                    <b>{r.title}</b>
                    {r.detail ? <small>{r.detail}</small> : null}
                  </span>
                  <span className="li__trail">{r.trail}</span>
                </Link>
              );
            })}
          </Fragment>
        ))}
        {loading ? (
          <div className="cmdk__grp" aria-live="polite">
            Searching readers, books and payments…
          </div>
        ) : offline ? (
          <div className="empty">
            <b>You're offline</b>
            <span>Records can't be searched until you're back online. Pages still open.</span>
          </div>
        ) : fresh?.failed ? (
          <div className="empty">
            <b>Some records couldn't be searched</b>
            <span>Check your connection and try again.</span>
          </div>
        ) : !rows.length ? (
          <div className="empty">
            <b>Nothing matches that</b>
            <span>Try a name, email, phone number, book title or store order id.</span>
          </div>
        ) : null}
        <div className="panel__foot">
          <span>Up and down to move · Enter to open</span>
          <span>
            {rows.length} {rows.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      </div>
    </section>
  );
}
