'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { nav, locate } from '@/lib/nav';
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
  env: string;
  children: ReactNode;
}

/** Every console page, for the search overlay (s-cmdk). People, books and payments join as flows build them. */
const pages = nav.flatMap(sec =>
  sec.sub.length ? sec.sub.map(s => ({ label: s.label, section: sec.label, href: `/${s.key}` })) : [{ label: sec.label, section: sec.label, href: sec.href }],
);

/**
 * Console shell: the same markup and class names as admin/src/02-shell.html, styled by the
 * prototype's own CSS (app/prototype.css). Nav state follows the prototype script: the current
 * page gets aria-current="page" and its section gets "open".
 */
export function Shell({ staff, env, children }: ShellProps) {
  const pathname = usePathname();
  const { section: openSection, page } = locate(pathname);
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
          {search ? <Search onClose={() => setSearch(false)} /> : null}
        </main>
      </div>
    </div>
  );
}

/** s-cmdk: search overlay. For now it finds console pages; records join as later flows add them. */
function Search({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? pages.filter(p => `${p.section} ${p.label}`.toLowerCase().includes(t)) : pages;
  }, [q]);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => setActive(0), [q]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

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
              if (e.key === 'ArrowDown') setActive(i => Math.min(i + 1, hits.length - 1));
              else if (e.key === 'ArrowUp') setActive(i => Math.max(i - 1, 0));
              else if (e.key === 'Enter' && hits[active]) go(hits[active].href);
              else return;
              e.preventDefault();
            }}
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="cmdk__grp">Pages</div>
        {hits.length ? (
          hits.map((p, i) => (
            <Link key={p.href} className={i === active ? 'li is-active' : 'li'} href={p.href} onClick={onClose}>
              <span className="li__body">
                <b>{p.label}</b>
              </span>
              <span className="li__trail">{p.section}</span>
            </Link>
          ))
        ) : (
          <div className="empty">
            <b>Nothing matches that yet</b>
            <span>Readers, books and payments become searchable as they arrive.</span>
          </div>
        )}
        <div className="panel__foot">
          <span>Up and down to move · Enter to open</span>
          <span>
            {hits.length} {hits.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      </div>
    </section>
  );
}
