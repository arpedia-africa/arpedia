/** Shared wording for s-campaigns, s-campaign-new and s-campaign-confirm. */

export type AudienceKind = 'all' | 'subscribers' | 'lapsed_30' | 'genre' | 'authors';
export interface Audience {
  kind: AudienceKind;
  genre_id?: string;
}
export type ScreenKey = 'home' | 'library' | 'credits' | 'plans' | 'discover';
export interface Target {
  kind: 'book' | 'author' | 'room' | 'screen';
  id?: string;
  screen?: ScreenKey;
}
export interface Reach {
  reach: number;
  left_out_cap: number;
}
export type CampaignStatus = 'draft' | 'in_review' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';

export const SCREENS: { key: ScreenKey; label: string; opens: string }[] = [
  { key: 'home', label: 'Home', opens: 'Opens Home' },
  { key: 'library', label: 'Library', opens: 'Opens Library' },
  { key: 'credits', label: 'Credits', opens: 'Opens Credits' },
  { key: 'plans', label: 'Plans', opens: 'Opens the plans screen' },
  { key: 'discover', label: 'Discover', opens: 'Opens Discover' },
];

export function audienceLabel(a: Audience, genres: Record<string, string>) {
  switch (a.kind) {
    case 'subscribers':
      return 'Subscribers';
    case 'lapsed_30':
      return 'Lapsed 30 days';
    case 'genre':
      return `Chose ${(a.genre_id && genres[a.genre_id]) || 'a genre'}`;
    case 'authors':
      return 'Authors';
    default:
      return 'All readers';
  }
}

/** "12,408 Christian & Faith readers" on Review and Confirm. */
export function goesTo(a: Audience, reach: number, genres: Record<string, string>) {
  const n = reach.toLocaleString('en-NG');
  switch (a.kind) {
    case 'subscribers':
      return `${n} subscribers`;
    case 'lapsed_30':
      return `${n} readers lapsed 30 days`;
    case 'genre':
      return `${n} ${(a.genre_id && genres[a.genre_id]) || 'genre'} readers`;
    case 'authors':
      return `${n} authors`;
    default:
      return `${n} readers`;
  }
}

export function opensLabel(t: Target) {
  if (t.kind === 'book') return 'Opens the book page';
  if (t.kind === 'author') return 'Opens the author page';
  if (t.kind === 'room') return 'Opens the reading room';
  return SCREENS.find(s => s.key === t.screen)?.opens ?? 'Opens Home';
}

/** Conversions name what the push asked for (rule 14). */
export function conversionLabel(t: Target, n: number) {
  const v = n.toLocaleString('en-NG');
  if (t.kind === 'book') return `${v} ${n === 1 ? 'unlock' : 'unlocks'}`;
  if (t.kind === 'room') return `${v} joined`;
  if (t.kind === 'author') return `${v} ${n === 1 ? 'follow' : 'follows'}`;
  return `${v} returned`;
}

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: 'Draft',
  in_review: 'Waiting for review',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  paused: 'Paused',
  cancelled: 'Cancelled',
};

const TZ = 'Africa/Lagos';

/** "Tue 10 Nov, 18:00" in WAT. */
export function whenLabel(iso: string) {
  const d = new Date(iso);
  const day = d
    .toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })
    .replace(',', '');
  const time = d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
}

export const monthName = (d = new Date()) => d.toLocaleDateString('en-GB', { timeZone: TZ, month: 'long' });

export const pct = (part: number, whole: number) => (whole ? `${((100 * part) / whole).toFixed(1)}%` : '0.0%');

export const LIMIT_TITLE = 65;
export const LIMIT_BODY = 178;
