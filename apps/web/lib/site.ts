const clean = (v: string | undefined) => (v ?? '').trim().replace(/\/+$/, '');

export const SITE_URL = clean(process.env.NEXT_PUBLIC_SITE_URL) || 'https://arpedia.africa';
/** api Worker base URL. Empty means "show the bundled policy text only". */
export const API_URL = clean(process.env.NEXT_PUBLIC_API_URL);
export const APP_STORE_URL = clean(process.env.NEXT_PUBLIC_APP_STORE_URL);
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.arpedia.reader';
export const SUPPORT_EMAIL = 'support@arpedia.africa';
export const AUTHORS_EMAIL = 'authors@arpedia.africa';

export const TAGLINE = 'Community at the heart of African stories';
export const DESCRIPTION =
  'Never read a book alone again. Subscribe, get credits, and unlock Christian novels, clean romance and African stories, with the readers, clubs and authors behind them.';
