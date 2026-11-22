// Where Discovery cards lead. The author page (flow 08) and Credits (flow 09) are built by later
// flows; until their routes exist a tap says so instead of opening a blank page.
import { router } from 'expo-router';

type Toast = (t: { message: string }) => void;

export const discoveryLinks = (toast: Toast) => ({
  book: (id: string) => router.push({ pathname: '/book/[id]', params: { id, source: 'discovery' } }),
  author: (_id: string) => toast({ message: 'Author pages are coming soon' }),
  credits: () => toast({ message: 'Credits are coming soon' }),
  explore: (genre?: string) => router.push(genre ? { pathname: '/explore', params: { genre } } : '/explore'),
  search: () => router.push('/search'),
  notifications: () => router.push('/notifications'),
  seeAll: (section: string) => router.push({ pathname: '/see-all', params: { section } }),
});
