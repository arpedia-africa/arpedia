// Where Discovery cards lead.
import { router } from 'expo-router';

type Toast = (t: { message: string }) => void;

// `toast` stays in the signature so callers don't change; every destination now exists.
export const discoveryLinks = (_toast: Toast) => ({
  book: (id: string) => router.push({ pathname: '/book/[id]', params: { id, source: 'discovery' } }),
  // Flow 08 analytics: author_profile_viewed source (search, or Home's discovery rails).
  author: (id: string, source: 'search' | 'discovery' = 'discovery') =>
    router.push({ pathname: '/author/[id]', params: { id, source } }),
  credits: () => router.push('/credits'),
  explore: (genre?: string) => router.push(genre ? { pathname: '/explore', params: { genre } } : '/explore'),
  search: () => router.push('/search'),
  notifications: () => router.push('/notifications'),
  seeAll: (section: string) => router.push({ pathname: '/see-all', params: { section } }),
});
