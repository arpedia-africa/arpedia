/** Shared wording for s-banners and s-banner-edit. */

export type Placement = 'home_top' | 'credits' | 'launch_modal';
export type BannerState = 'draft' | 'scheduled' | 'live' | 'ended';
export interface BannerAudience {
  kind: 'all' | 'subscribers' | 'genre' | 'below_version';
  genre_id?: string;
  version?: string;
}
export interface BannerTarget {
  kind: 'book' | 'author' | 'room' | 'screen' | 'web';
  id?: string;
  screen?: string;
  url?: string;
}
export interface Banner {
  id: string;
  placement: Placement;
  headline: string;
  body: string;
  button_label: string;
  target: BannerTarget | null;
  image_url: string | null;
  audience: BannerAudience;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  dismissible: boolean;
  state: BannerState;
  live_state: BannerState;
  shown: number;
  taps: number;
  tap_rate: number | null;
  updated_at: string;
  updated_by_name: string | null;
}

export const PLACEMENT_LABEL: Record<Placement, string> = {
  home_top: 'Home top',
  credits: 'Credits page',
  launch_modal: 'Modal on launch',
};
export const STATE_LABEL: Record<BannerState, string> = {
  live: 'Live',
  scheduled: 'Scheduled',
  ended: 'Ended',
  draft: 'Draft',
};

export function bannerAudienceLabel(a: BannerAudience, genres: Record<string, string>) {
  if (a.kind === 'subscribers') return 'Subscribers';
  if (a.kind === 'genre') return `Chose ${(a.genre_id && genres[a.genre_id]) || 'a genre'}`;
  if (a.kind === 'below_version') return `App below ${a.version ?? '?'}`;
  return 'All readers';
}

/** Priority is stored highest-first (get_active_banners sorts desc); staff see 1 = shows first. */
export const PRIORITIES = [
  { rank: 1, stored: 3, label: '1 (shows first)' },
  { rank: 2, stored: 2, label: '2' },
  { rank: 3, stored: 1, label: '3' },
];
export const rankOf = (stored: number) => (stored >= 3 ? 1 : stored === 2 ? 2 : 3);

const TZ = 'Africa/Lagos';
export const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' });

export const LIMIT_HEADLINE = 48;
export const LIMIT_BODY = 120;
