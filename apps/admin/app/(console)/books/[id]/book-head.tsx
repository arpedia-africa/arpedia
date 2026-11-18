import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { coverClass } from '../shared';
import { BookMenu } from './book-menu';

export type BookTab = 'details' | 'revisions' | 'access' | 'stats';

const TABS: [BookTab, string, string][] = [
  ['details', 'Details', ''],
  ['revisions', 'Revisions', '/revisions'],
  ['access', 'Pricing and access', '/access'],
  ['stats', 'Stats', '/stats'],
];

/**
 * The book page header shared by Details, Pricing and access and Stats (s-book, s-book-access,
 * s-book-stats): crumbs, cover, title and meta, the main action, the ⋯ menu and the four tabs.
 */
export function BookHead({
  bookId,
  title,
  tab,
  meta,
  action,
  live,
}: {
  bookId: string;
  title: string;
  tab: BookTab;
  meta: string[];
  action: ReactNode;
  live: boolean;
}) {
  const crumb = TABS.find(t => t[0] === tab)!;
  return (
    <>
      <div className="ph">
        <div className="crumbs">
          <Link href="/books">Books</Link>
          <Icon name="chev" size="s" />
          {tab === 'details' ? (
            <span>{title}</span>
          ) : (
            <>
              <Link href={`/books/${bookId}`}>{title}</Link>
              <Icon name="chev" size="s" />
              <span>{crumb[1]}</span>
            </>
          )}
        </div>
        <div className="ph__row">
          <span className={`cv ${coverClass(bookId)} x56`}>
            <b>{title}</b>
          </span>
          <div className="ph__title">
            <h1>{title}</h1>
            <div className="ph__meta">
              {meta.map(m => (
                <span key={m}>{m}</span>
              ))}
            </div>
          </div>
          <div className="ph__acts">
            {action}
            <BookMenu bookId={bookId} title={title} live={live} />
          </div>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([key, label, path]) => (
          <Link key={key} role="tab" aria-selected={key === tab} href={`/books/${bookId}${path}`}>
            {label}
          </Link>
        ))}
      </div>
    </>
  );
}
