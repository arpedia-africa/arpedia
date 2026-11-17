'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Command } from 'cmdk';
import { nav, locate } from '@/lib/nav';
import { Icon } from './icon';
import styles from './shell.module.css';

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
  signOut: () => Promise<void>;
  children: ReactNode;
}

/** Console shell (admin/src/02-shell.html): night sidebar with 10 sections, top bar, command palette. */
export function Shell({ staff, env, signOut, children }: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { section: openSection, page } = locate(pathname);
  const [sideOpen, setSideOpen] = useState(false);
  const [cmdk, setCmdk] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdk(v => !v);
      }
      if (e.key === 'Escape') setSideOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => setSideOpen(false), [pathname]);

  const envLabel = env === 'production' ? 'Production' : env === 'staging' ? 'Staging' : 'Local';

  return (
    <div className={styles.console}>
      <aside className={`${styles.side} ${sideOpen ? styles.sideOpen : ''}`} aria-label="Admin navigation">
        <div className={styles.brand}>
          <img src="/brand/mark.png" width={32} height={32} alt="" />
          <div>
            <span className={styles.wordmark} role="img" aria-label="arpedia" />
            <small>Admin console</small>
          </div>
        </div>
        <div className={styles.env}>
          <span className={styles.dot} />
          <span>
            <b>{envLabel}</b> · admin.arpedia.africa
          </span>
        </div>
        <nav className={styles.nav}>
          {nav.map(sec => {
            const open = sec.key === openSection?.key;
            const current = open && (sec.sub.length === 0 || !page);
            return (
              <div key={sec.key} className={`${styles.sec} ${open ? styles.secOpen : ''}`}>
                <Link
                  href={sec.href}
                  className={styles.item}
                  aria-current={current ? 'page' : undefined}
                  aria-expanded={sec.sub.length ? open : undefined}
                >
                  <Icon name={sec.icon} />
                  {sec.label}
                </Link>
                {sec.sub.length && open ? (
                  <div className={styles.sub}>
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
        <form action={signOut} className={styles.me}>
          <span className="av sm g">{initials(staff.name)}</span>
          <span className={styles.meText}>
            <b>{staff.name}</b>
            <small>{staff.roleLabel}</small>
          </span>
          <button type="submit" className={`ib ${styles.signOut}`} aria-label="Sign out">
            <Icon name="out" size="s" />
          </button>
        </form>
      </aside>
      {sideOpen ? <div className={styles.scrim} onClick={() => setSideOpen(false)} aria-hidden="true" /> : null}

      <div className={styles.workspace}>
        <div className={styles.topbar}>
          <button className={`ib ${styles.topmenu}`} aria-label="Open navigation" onClick={() => setSideOpen(true)}>
            <Icon name="menu" />
          </button>
          <button type="button" className={styles.gsearch} onClick={() => setCmdk(true)}>
            <Icon name="search" size="s" />
            <span>Search readers, books, authors, payments</span>
            <kbd>Ctrl K</kbd>
          </button>
          <span className={styles.spacer} />
          {/* Opens the Books pipeline; the upload form itself arrives with flow 12. */}
          <Link href="/books" className="btn btn-g sm">
            <Icon name="plus" size="xs" />
            New book
          </Link>
          <button type="button" className="ib" aria-label="Staff alerts">
            <Icon name="bell" />
          </button>
          <button type="button" className="ib" aria-label="Help">
            <Icon name="help" />
          </button>
        </div>
        <main className={styles.view}>{children}</main>
      </div>

      <Command.Dialog
        open={cmdk}
        onOpenChange={setCmdk}
        label="Search the console"
        className={styles.cmdk}
        overlayClassName={styles.cmdkOverlay}
      >
        <Command.Input placeholder="Search readers, books, authors, payments" className={styles.cmdkInput} />
        <Command.List className={styles.cmdkList}>
          <Command.Empty className={styles.cmdkEmpty}>Nothing matches that yet.</Command.Empty>
          {nav.map(sec => (
            <Command.Group key={sec.key} heading={sec.label} className={styles.cmdkGroup}>
              {(sec.sub.length ? sec.sub.map(s => ({ ...s, href: `/${s.key}` })) : [{ key: sec.key, label: sec.label, href: sec.href }]).map(item => (
                <Command.Item
                  key={item.key}
                  value={`${sec.label} ${item.label}`}
                  onSelect={() => {
                    setCmdk(false);
                    router.push(item.href);
                  }}
                  className={styles.cmdkItem}
                >
                  {item.label}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command.Dialog>
    </div>
  );
}
