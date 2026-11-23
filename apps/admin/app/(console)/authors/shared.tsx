import Link from 'next/link';
import { Icon } from '@/components/icon';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff, type Staff } from '@/lib/staff';
import type { Supa } from '../books/shared';

export type Tab = 'authors' | 'applications';

/** The avatar colours the prototype uses (`av g t m b r k o n`), fixed per person. */
export function avClass(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 'gtmbrkon'[h % 8]!;
}

/** The review promise: late means more than 5 days since the application was sent. */
export const LATE_DAYS = 5;

export const n0 = (n: number) => n.toLocaleString('en-NG');
/** ₦ from kobo, whole naira. */
export const naira = (kobo: number) => `₦${n0(Math.round(kobo / 100))}`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "2026-10" → "October 2026"; with `short` → "Oct". */
export const monthName = (ym: string, short = false) => {
  const [y, m] = ym.split('-').map(Number);
  const name = MONTHS[(m ?? 1) - 1] ?? '';
  return short ? name.slice(0, 3) : `${name} ${y}`;
};
/** The Lagos month of a time, as YYYY-MM. */
export const lagosMonth = (at: string | number) =>
  new Date(at).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }).slice(0, 7);

/** Everything the people pages need before they render: the signed-in staff member and page access. */
export async function gate(): Promise<{ staff: Staff } | { denied: React.ReactElement }> {
  const staff = await requireStaff();
  if (!canOpen('applications', staff.permissions))
    return { denied: <NoAccess page="applications" label="Authors and applications" role={staff.role} /> };
  return { staff };
}

/** Waiting applications: New and Needs more info (the prototype's "7 waiting"). */
export async function applicationCount(supabase: Supa) {
  const { count } = await supabase
    .from('author_applications')
    .select('id', { count: 'exact', head: true })
    .in('status', ['new', 'needs_info']);
  return count ?? 0;
}

export interface AuthorRow {
  user_id: string;
  pen_name: string;
  status: 'active' | 'suspended';
  approved_at: string;
  payouts_paused: boolean;
  club_group_id: string | null;
  payout_account_status: 'not_set' | 'verified' | 'failed';
  books_live: number;
  genres: string[];
  reads: number;
  last_month_kobo: number;
}

/** admin_authors(): every author with books live, readers, last month's earnings and payout status. */
export async function loadAuthors(supabase: Supa) {
  const { data, error } = await supabase.rpc('admin_authors');
  if (error) return { rows: [] as AuthorRow[], denied: error.code === '42501', failed: error.code !== '42501' };
  return { rows: (data ?? []) as unknown as AuthorRow[], denied: false, failed: false };
}

export interface AuthorMonth {
  month: string;
  credits: number;
  earned_kobo: number;
  unlock_all_credits: number;
  unlock_all_kobo: number;
  paygo_credits: number;
  paygo_kobo: number;
  tips_credits: number;
  tips_kobo: number;
  refund_kobo: number;
}

export interface AuthorDetail {
  profile: {
    user_id: string;
    pen_name: string;
    bio: string;
    location: string | null;
    status: 'active' | 'suspended';
    suspended_reason: string | null;
    approved_at: string;
    club_group_id: string | null;
    payouts_paused: boolean;
    payouts_paused_reason: string | null;
    legal_name?: string;
    payee_type?: 'individual' | 'company';
  };
  full_name: string | null;
  books: { book_id: string; title: string; status: string; price_credits: number | null }[];
  months: AuthorMonth[];
  reads: number;
  recent: { at: string; action: string; summary: string | null }[];
}

/** admin_author(): profile, books, earnings by month and recent activity for one author. */
export async function loadAuthor(supabase: Supa, id: string) {
  const { data, error } = await supabase.rpc('admin_author', { p_user: id });
  if (error) {
    if (error.code === '42501') return { denied: true as const };
    if (error.message.includes('not_found') || error.code === '22P02') return { missing: true as const };
    throw error;
  }
  return { author: data as unknown as AuthorDetail };
}

/** Followers per author, from author_stats (kept by the follows trigger). */
export async function loadFollowers(supabase: Supa) {
  const { data } = await supabase.from('author_stats').select('author_id, follower_count');
  return new Map((data ?? []).map(s => [s.author_id, s.follower_count]));
}

export interface AuthorSocial {
  follower_count: number;
  reader_count: number;
  avg_rating: number | null;
  earnings_kobo: number;
  tips: { count: number; credits: number };
  messages: { count: number; credits: number };
  threads: number;
  community: { id: string; name: string; member_count: number } | null;
}

/** admin_author_social(): followers, tips, paid reader messages and the community. Never message bodies. */
export async function loadSocial(supabase: Supa, id: string) {
  const { data, error } = await supabase.rpc('admin_author_social', { p_user: id });
  return error ? null : (data as unknown as AuthorSocial);
}

/** "1 follower", "1,240 followers". */
export const followers = (n: number) => `${n0(n)} follower${n === 1 ? '' : 's'}`;

/** The author's name for headings. */
export const authorName = (a: AuthorDetail) => a.profile.pen_name || a.full_name || 'Author';

/** The Authors band and its two tabs (s-authors, s-applications). */
export function AuthorsHeader({ tab, authors, waiting }: { tab: Tab; authors: number; waiting: number }) {
  return (
    <>
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Authors</h1>
          </div>
          {tab === 'authors' && (
            <div className="band__acts">
              <Link className="ib" href="/exports" aria-label="Export authors">
                <Icon name="down" />
              </Link>
            </div>
          )}
        </div>
      </div>
      <div className="tabs" role="tablist">
        <Link role="tab" aria-selected={tab === 'authors'} href="/authors">
          Authors <span className="c">{authors}</span>
        </Link>
        <Link role="tab" aria-selected={tab === 'applications'} href="/applications">
          Applications <span className="c">{waiting}</span>
        </Link>
      </div>
    </>
  );
}
