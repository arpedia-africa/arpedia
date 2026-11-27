import { describe, expect, it } from 'vitest';
import { authorHit, bookHit, initials, matchAuthors, paymentHit, readerHit, searchKinds, searchTerm } from './search';

const country = (c: string | null) => ({ NG: 'Nigeria' })[c ?? ''] ?? c ?? '';

describe('searchTerm', () => {
  it('keeps names, emails, phones and store ids', () => {
    expect(searchTerm('  Ngozi   Eze ')).toBe('Ngozi Eze');
    expect(searchTerm('ngozi.eze@gmail.com')).toBe('ngozi.eze@gmail.com');
    expect(searchTerm('+234 803')).toBe('+234 803');
    expect(searchTerm('GPA.3391-2210_55')).toBe('GPA.3391-2210_55');
  });
  it('drops marks that would break a filter, and short queries', () => {
    expect(searchTerm('a,b)(c*%')).toBe('abc');
    expect(searchTerm('n')).toBeNull();
    expect(searchTerm(' ,; ')).toBeNull();
    expect(searchTerm('x'.repeat(200))).toHaveLength(80);
  });
});

describe('searchKinds', () => {
  it('searches only the groups whose page the role can open', () => {
    expect(searchKinds(['view_readers', 'view_money'])).toEqual(['readers', 'payments']);
    expect(searchKinds(['approve_books'])).toEqual(['authors', 'books']);
    expect(searchKinds(['format_books'])).toEqual(['books']);
    expect(searchKinds(['moderate_reports'])).toEqual([]);
    expect(searchKinds(['view_readers', 'approve_books', 'view_money'])).toEqual([
      'readers',
      'authors',
      'books',
      'payments',
    ]);
  });
});

describe('hits', () => {
  it('a reader shows email, plan and country, and opens the reader', () => {
    const base = { id: 'u1', name: 'Ngozi Eze', email: 'ngozi@example.com', country: 'NG', deleted: false };
    const hit = readerHit({ ...base, plan: { plan: 'quarterly', status: 'active' } }, country);
    expect(hit).toMatchObject({
      href: '/users/u1',
      title: 'Ngozi Eze',
      detail: 'ngozi@example.com · Quarterly plan · Nigeria',
      trail: 'Reader',
      avatar: { text: 'NE' },
    });
    expect(readerHit({ ...base, plan: null, country: null }, country).detail).toBe('ngozi@example.com · No plan');
    expect(readerHit({ ...base, plan: { plan: 'monthly', status: 'expired' } }, country).detail).toContain(
      'Monthly plan · lapsed',
    );
    expect(readerHit({ ...base, name: null, plan: null, deleted: true }, country)).toMatchObject({
      title: 'ngozi@example.com',
      detail: 'ngozi@example.com · Deleted · Nigeria',
    });
  });

  it('an author shows books live and followers', () => {
    const a = { user_id: 'a1', pen_name: 'Ngozi Adichie-Bello', status: 'active' as const, books_live: 3 };
    expect(authorHit(a, 1240)).toMatchObject({
      href: '/authors/a1',
      detail: '3 books live · 1,240 followers',
      trail: 'Author',
    });
    expect(authorHit({ ...a, books_live: 1, status: 'suspended' }, 1).detail).toBe(
      '1 book live · 1 follower · Suspended',
    );
  });

  it('authors match by pen name, most books live first, at most 3', () => {
    const row = (id: string, pen_name: string, books_live: number) => ({
      user_id: id,
      pen_name,
      status: 'active' as const,
      books_live,
    });
    const rows = [row('1', 'Ngozi A', 1), row('2', 'Bola', 9), row('3', 'ngozi B', 4), row('4', 'Ngozi C', 2), row('5', 'Ngozi D', 0)];
    expect(matchAuthors(rows, 'NGOZI').map(a => a.user_id)).toEqual(['3', '4', '1']);
  });

  it('a book shows its author and status', () => {
    expect(bookHit({ id: 'b1', title: 'Kano Nights', status: 'taken_down', author: { full_name: 'Amina Bello' } })).toEqual({
      id: 'b1',
      href: '/books/b1',
      title: 'Kano Nights',
      detail: 'Amina Bello · Taken down',
      trail: 'Book',
    });
  });

  it('a payment shows amount, item, store, order id, reader and day', () => {
    const p = {
      id: 't1',
      created_at: '2026-11-02T10:00:00Z',
      kind: 'plan',
      plan_code: 'quarterly',
      topup_code: null,
      store: 'play',
      store_txn_id: 'GPA.3391-2210-5530-41877',
      gross_kobo: 240_000,
      status: 'succeeded',
      user: { full_name: 'Ngozi Eze' },
    };
    const hit = paymentHit(p);
    expect(hit.href).toBe('/transactions/t1');
    expect(hit.title).toMatch(/^₦2,400(\.00)? Quarterly plan · Google Play$/);
    expect(hit.detail).toBe('GPA.3391-2210-5530-41877 · Ngozi Eze · 2 Nov');
    expect(paymentHit({ ...p, kind: 'topup', plan_code: null, status: 'refunded', user: null }).detail).toBe(
      'GPA.3391-2210-5530-41877 · 2 Nov · Refunded',
    );
  });

  it('initials never come out empty', () => {
    expect(initials('  ')).toBe('?');
    expect(initials('amaka obi nwosu')).toBe('AO');
  });
});
