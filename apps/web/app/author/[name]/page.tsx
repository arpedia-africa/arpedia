import type { Metadata } from 'next';
import { ShareLanding, shareMetadata } from '@/components/share-landing';
import { deepLink, nameFromSlug } from '@/lib/share';

type Props = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const name = nameFromSlug((await params).name) || 'An author';
  return shareMetadata(name, `Follow ${name} on Arpedia and join the rooms around their books.`);
}

export default async function AuthorLink({ params }: Props) {
  const { name } = await params;
  const shown = nameFromSlug(name) || 'An author on Arpedia';
  return (
    <ShareLanding
      info={{
        kicker: 'Author',
        title: shown,
        body: 'Follow the author, join the room around their books, and ask your question where the chapter is being discussed.',
        open: deepLink.author(name),
      }}
    />
  );
}
