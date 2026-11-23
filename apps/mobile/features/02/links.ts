// Where Discovery cards lead.
import { router } from 'expo-router';

type Toast = (t: { message: string }) => void;

// `toast` stays in the signature so callers don't change; every destination now exists.
export const discoveryLinks = (_toast: Toast) => ({
  book: (id: string) => router.push({ pathname: '/book/[id]', params: { id, source: 'discovery' } }),
  author: (id: string) => router.push({ pathname: '/author/[id]', params: { id, source: 'discovery' } }),
  credits: () => router.push('/credits'),
  explore: (genre?: string) => router.push(genre ? { pathname: '/explore', params: { genre } } : '/explore'),
  search: () => router.push('/search'),
  notifications: () => router.push('/notifications'),
  seeAll: (section: string) => router.push({ pathname: '/see-all', params: { section } }),
});
