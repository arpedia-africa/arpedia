import { API_URL } from './site';

export interface PolicyMeta {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
}

/** Slugs as in the console (flow 16 rule 38) and workers/api/src/routes/16/legal.ts. */
export const POLICIES: PolicyMeta[] = [
  {
    slug: 'terms',
    title: 'Terms of Service',
    subtitle: 'The rules for using Arpedia',
    description: 'The terms that apply when you use the Arpedia reading app.',
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    subtitle: 'What we collect, why, and your choices',
    description: 'What personal data Arpedia collects, why, and the choices you have.',
  },
  {
    slug: 'community-guidelines',
    title: 'Community Guidelines',
    subtitle: 'How we treat each other in clubs and rooms',
    description: 'What is welcome in Arpedia clubs, rooms, reviews and messages.',
  },
  {
    slug: 'copyright',
    title: 'Copyright and Takedown',
    subtitle: 'How to tell us about infringing content',
    description: 'How to tell Arpedia about content that infringes your copyright.',
  },
  {
    slug: 'author-agreement',
    title: 'Author Agreement',
    subtitle: 'For authors who publish on Arpedia',
    description: 'What authors agree to when they publish a book on Arpedia, and how royalties work.',
  },
  {
    slug: 'refunds',
    title: 'Refund Policy',
    subtitle: 'Web payments, and store purchases',
    description: 'How refunds work for Arpedia web payments and for Google Play and App Store purchases.',
  },
  {
    slug: 'delete-account',
    title: 'Delete your Arpedia account',
    subtitle: 'In the app, or by email',
    description: 'How to delete your Arpedia account and what happens to your data.',
  },
];

export const policyBySlug = (slug: string) => POLICIES.find((p) => p.slug === slug);

export interface PublishedPolicy {
  title: string;
  /** "Version 3 · 24 November 2026" */
  meta: string;
  /** HTML from the api Worker, already escaped there. */
  html: string;
}

/** Anything shorter than this is the one-line placeholder the console starts with (version 1). */
const MIN_PUBLISHED_TEXT = 300;

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/**
 * Pulls the policy out of the api Worker's public page: h1, the "Version n · date" line, then the
 * body. The Worker's own "how to delete" steps are dropped; our page always shows its own.
 * Returns null when the page is not a real published policy.
 */
export function parseWorkerPolicy(page: string): PublishedPolicy | null {
  const h1 = /<h1>([\s\S]*?)<\/h1>/.exec(page);
  const meta = /<p class="meta">([\s\S]*?)<\/p>/.exec(page);
  if (!h1 || !meta) return null;
  const start = (meta.index ?? 0) + meta[0].length;
  const end = page.indexOf('<footer>', start);
  let html = page.slice(start, end === -1 ? undefined : end).replace(/<\/main>[\s\S]*$/, '');
  html = html
    .replace(/<section class="steps">[\s\S]*?<\/section>/, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .trim();
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length < MIN_PUBLISHED_TEXT) return null;
  return { title: decode(h1[1]!.replace(/<[^>]*>/g, '')), meta: decode(meta[1]!), html };
}

/** The published policy from the api Worker, or null (no API set, it is down, or only a placeholder). */
export async function fetchPublishedPolicy(slug: string): Promise<PublishedPolicy | null> {
  if (!API_URL) return null;
  try {
    const res = await fetch(`${API_URL}/legal/${slug}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    return parseWorkerPolicy(await res.text());
  } catch {
    return null;
  }
}
