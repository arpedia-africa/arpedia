import type { Metadata } from 'next';
import { ShareLanding, shareMetadata } from '@/components/share-landing';
import { deepLink, titleFromSlug } from '@/lib/share';

type Props = { params: Promise<{ slug: string }> };

// The slug can carry a short id suffix (the-alignment-8d2b0385). Dropping it gives a readable title
// for the link preview without calling any server.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const title = titleFromSlug((await params).slug) || 'A book';
  return shareMetadata(
    title,
    `Read ${title} on Arpedia, with the book club and the author in the same room.`,
  );
}

export default async function BookLink({ params }: Props) {
  const { slug } = await params;
  const title = titleFromSlug(slug) || 'A book on Arpedia';
  return (
    <ShareLanding
      info={{
        kicker: 'On Arpedia',
        title,
        body: 'Read the first 10% free, then talk about it with the readers, the clubs and the author.',
        open: deepLink.book(slug),
      }}
    />
  );
}
