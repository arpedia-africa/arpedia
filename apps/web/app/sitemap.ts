import type { MetadataRoute } from 'next';
import { POLICIES } from '@/lib/legal';
import { SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ['/', '/support', '/legal', ...POLICIES.map((p) => `/legal/${p.slug}`)];
  return pages.map((p) => ({
    url: `${SITE_URL}${p === '/' ? '' : p}`,
    changeFrequency: p === '/' ? 'weekly' : 'monthly',
    priority: p === '/' ? 1 : p.startsWith('/legal/') ? 0.4 : 0.6,
  }));
}
