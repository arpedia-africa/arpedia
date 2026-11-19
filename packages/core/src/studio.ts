// Author Studio rules shared by the app and the admin (docs/prd/11-author-studio.md).
import { AUTHOR_RATE, bookPrice, standardPages } from './pricing';

/** Categories an applicant can pick (rule 2). The database refuses anything else. */
export const APPLICATION_CATEGORIES = [
  'Christian fiction',
  'Clean romance',
  'African stories',
  'Poetry',
  'Devotionals',
  'Non-fiction',
  'Short stories',
] as const;
export type ApplicationCategory = (typeof APPLICATION_CATEGORIES)[number];

export const BIO_MAX = 300;
export const SAMPLE_MAX_PAGES = 10;
export const SAMPLE_MAX_BYTES = 5 * 1024 * 1024;
export const SAMPLE_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
} as const;
/** Days a rejected applicant waits before applying again, when staff allow it. */
export const REAPPLY_DAYS = 30;
/** Admin review promise in days (open question 2); the app copy says "about 3 days". */
export const REVIEW_SLA_DAYS = 5;
export const REVIEW_COPY_DAYS = 3;
/** Minimum payout in kobo (₦1,000). */
export const MIN_PAYOUT_KOBO = 100_000;

/** What one full read of a book pays its author, in kobo: price × ₦1.60. */
export function perReadEarningKobo(priceCredits: number): number {
  if (!Number.isInteger(priceCredits) || priceCredits < 0) {
    throw new RangeError(`priceCredits must be a whole number ≥ 0, got ${priceCredits}`);
  }
  return Math.round(priceCredits * AUTHOR_RATE * 100);
}

/** Price and per-read earning of a book from its length (Step 3 and Step 4 of submit). */
export function bookQuote(words: number, imagePages = 0) {
  const pages = standardPages(words, imagePages);
  const price = bookPrice(pages);
  return { pages, price, naira: price * 3, perReadKobo: perReadEarningKobo(price) };
}

/** "₦1,234" or "₦1,234.50" from kobo. */
export function formatKobo(kobo: number): string {
  const naira = kobo / 100;
  const whole = Number.isInteger(naira);
  return `₦${naira.toLocaleString('en-NG', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface ApplicationDraft {
  legal_name: string;
  email: string;
  phone: string | null;
  date_of_birth: string | null;
  state: string | null;
  categories: string[];
  bio: string;
  sample_file_key: string | null;
  sample_text: string | null;
}

export type ApplicationField =
  'legal_name' | 'email' | 'phone' | 'date_of_birth' | 'state' | 'categories' | 'bio' | 'sample' | 'terms';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE = /^\+[1-9][0-9]{7,14}$/;

/** Fields still missing before Send (rule 6). Mirrors submit_application's checks. */
export function missingApplicationFields(a: ApplicationDraft, termsAccepted: boolean): ApplicationField[] {
  const out: ApplicationField[] = [];
  if (!a.legal_name.trim()) out.push('legal_name');
  if (!EMAIL.test(a.email)) out.push('email');
  if (a.phone && !PHONE.test(a.phone)) out.push('phone');
  if (!a.date_of_birth) out.push('date_of_birth');
  if (!a.state) out.push('state');
  if (a.categories.length === 0) out.push('categories');
  if (!a.bio.trim() || a.bio.length > BIO_MAX) out.push('bio');
  if (!a.sample_file_key && !a.sample_text?.trim()) out.push('sample');
  if (!termsAccepted) out.push('terms');
  return out;
}

/** The application step (1–4) a missing field lives on. */
export const fieldStep = (f: ApplicationField): 1 | 2 | 3 | 4 =>
  f === 'categories' || f === 'bio' ? 2 : f === 'sample' ? 3 : f === 'terms' ? 4 : 1;

/** Author-facing status of a book (rule 14), as returned by studio_books(). */
export type StudioBookStatus =
  | 'draft'
  | 'in_review'
  | 'changes_requested'
  | 'live'
  | 'update_draft'
  | 'update_in_review'
  | 'scheduled'
  | 'unpublished'
  | 'taken_down'
  | 'rejected';

export function studioBookLine(status: StudioBookStatus, revisionNo: number, liveRevisionNo: number | null) {
  switch (status) {
    case 'draft':
      return { label: 'Draft', note: 'Confirm your chapters and submit when ready', action: 'Continue' };
    case 'in_review':
      return { label: 'In review', note: 'We will tell you as soon as it is checked', action: null };
    case 'changes_requested':
      return {
        label: 'Changes requested',
        note: 'Fix the issues below and upload again',
        action: 'Upload new file',
      };
    case 'live':
      return { label: 'Live', note: null, action: 'Upload new file' };
    case 'update_draft':
      return { label: 'Live', note: `Update v${revisionNo} not sent yet`, action: 'Continue' };
    case 'update_in_review':
      return {
        label: 'Live',
        note: `Update v${revisionNo} in review · readers still see v${liveRevisionNo ?? revisionNo - 1}`,
        action: null,
      };
    case 'scheduled':
      return { label: 'Scheduled', note: null, action: null };
    case 'unpublished':
      return { label: 'Unpublished', note: 'Readers who unlocked it keep their copy', action: null };
    case 'taken_down':
      return { label: 'Taken down', note: 'Earnings are frozen', action: 'How to appeal' };
    case 'rejected':
      return { label: 'Not accepted', note: null, action: 'How to appeal' };
  }
}

/** Reply-by date of a sent application: sent date plus the review promise. */
export function replyByDate(sentAt: Date, days = REVIEW_SLA_DAYS): Date {
  const d = new Date(sentAt);
  d.setDate(d.getDate() + days);
  return d;
}
