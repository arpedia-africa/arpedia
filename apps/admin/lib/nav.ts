import type { IconName } from '@/components/icon';

export interface NavSection {
  key: string;
  label: string;
  icon: IconName;
  href: string;
  sub: { key: string; label: string }[];
}

/** The 10 sidebar sections and their sub-pages, exactly as admin/src/02-shell.html. */
export const nav: NavSection[] = [
  { key: 'home', label: 'Home', icon: 'layout', href: '/', sub: [] },
  {
    key: 'books', label: 'Books', icon: 'lib', href: '/books',
    sub: [
      { key: 'books', label: 'Pipeline' },
      { key: 'curation', label: 'Discover curation' },
      { key: 'genres', label: 'Genres and tags' },
    ],
  },
  {
    key: 'people', label: 'People', icon: 'users', href: '/users',
    sub: [
      { key: 'users', label: 'Readers' },
      { key: 'applications', label: 'Authors and applications' },
      { key: 'data-requests', label: 'Privacy requests' },
    ],
  },
  {
    key: 'safety', label: 'Safety', icon: 'flag', href: '/reports',
    sub: [
      { key: 'reports', label: 'Reports' },
      { key: 'community', label: 'Community' },
      { key: 'claims', label: 'Copyright claims' },
      { key: 'appeals', label: 'Appeals' },
      { key: 'automod', label: 'Safety rules' },
    ],
  },
  {
    key: 'support', label: 'Support', icon: 'inbox', href: '/support',
    sub: [
      { key: 'support', label: 'Inbox' },
      { key: 'help', label: 'Help articles' },
    ],
  },
  {
    key: 'money', label: 'Money', icon: 'chart', href: '/revenue',
    sub: [
      { key: 'revenue', label: 'Revenue' },
      { key: 'subscriptions', label: 'Subscriptions' },
      { key: 'transactions', label: 'Transactions' },
      { key: 'refunds', label: 'Refunds' },
      { key: 'credits', label: 'Credits' },
      { key: 'pricing', label: 'Plans and pricing' },
      { key: 'promos', label: 'Promo codes' },
    ],
  },
  {
    key: 'payouts', label: 'Payouts', icon: 'bank', href: '/royalties',
    sub: [
      { key: 'royalties', label: 'Author earnings' },
      { key: 'payouts', label: 'Transfers' },
      { key: 'bank-accounts', label: 'Bank accounts' },
    ],
  },
  {
    key: 'messages', label: 'Messages', icon: 'bell', href: '/campaigns',
    sub: [
      { key: 'campaigns', label: 'Push notifications' },
      { key: 'banners', label: 'In-app announcements' },
      { key: 'emails', label: 'Emails' },
    ],
  },
  {
    key: 'insights', label: 'Insights', icon: 'line', href: '/analytics',
    sub: [
      { key: 'analytics', label: 'Analytics' },
      { key: 'exports', label: 'Exports' },
    ],
  },
  {
    key: 'settings', label: 'Settings', icon: 'cog', href: '/team',
    sub: [
      { key: 'team', label: 'Team and roles' },
      { key: 'audit', label: 'Audit log' },
      { key: 'config', label: 'App config' },
      { key: 'pricing-rules', label: 'Pricing rules' },
      { key: 'policies', label: 'Policies' },
      { key: 'integrations', label: 'Integrations' },
    ],
  },
];

/**
 * Who may open each page: any one of these permissions (role_permissions, allowed or limited).
 * Pages not listed are open to every staff member. The server checks again in every RPC.
 */
export const pageAccess: Record<string, string[]> = {
  books: ['approve_books', 'format_books'],
  curation: ['curate_discover'],
  genres: ['curate_discover'],
  users: ['view_readers'],
  applications: ['approve_books'],
  'data-requests': ['export_personal'],
  reports: ['moderate_reports'],
  community: ['moderate_reports'],
  claims: ['decide_claims'],
  appeals: ['moderate_reports'],
  automod: ['moderate_reports'],
  support: ['answer_support'],
  help: ['answer_support'],
  revenue: ['view_money'],
  subscriptions: ['view_money'],
  transactions: ['view_money'],
  refunds: ['refund'],
  credits: ['grant_credits'],
  pricing: ['change_prices'],
  promos: ['change_prices'],
  royalties: ['release_payouts'],
  payouts: ['release_payouts'],
  'bank-accounts': ['release_payouts'],
  campaigns: ['send_push'],
  banners: ['send_push'],
  emails: ['send_push'],
  analytics: ['view_analytics'],
  exports: ['view_analytics'],
  team: ['manage_team'],
  audit: ['view_audit'],
  config: ['manage_settings'],
  'pricing-rules': ['manage_settings'],
  policies: ['manage_settings'],
  integrations: ['manage_settings'],
};

export const canOpen = (page: string, permissions: readonly string[]) =>
  !pageAccess[page] || pageAccess[page].some(p => permissions.includes(p));

/** The sidebar for one role: sections and pages it can open, each section linking to its first page. */
export function navFor(permissions: readonly string[]): NavSection[] {
  return nav.flatMap(sec => {
    if (!sec.sub.length) return [sec];
    const sub = sec.sub.filter(s => canOpen(s.key, permissions));
    return sub.length ? [{ ...sec, sub, href: `/${sub[0]!.key}` }] : [];
  });
}

/** Find the section and page for a path like "/curation". */
export function locate(pathname: string) {
  const first = pathname.split('/')[1] ?? '';
  // Pages that live under another page's sidebar link (s-roles is a tab of Team and roles).
  // /authors (s-authors, s-author) sit beside Applications under People.
  // A reader's credit ledger (/credits/<user>) is a tab of the reader, so it sits under People › Readers.
  const page =
    first === 'credits' && pathname.split('/')[2]
      ? 'users'
      : (({ roles: 'team', authors: 'applications' } as Record<string, string>)[first] ?? first);
  if (!page) return { section: nav[0]!, page: undefined };
  for (const section of nav) {
    const sub = section.sub.find(s => s.key === page);
    if (sub) return { section, page: sub };
  }
  return { section: undefined, page: undefined };
}
