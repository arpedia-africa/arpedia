import { ShareLanding, shareMetadata } from '@/components/share-landing';
import { deepLink } from '@/lib/share';

type Props = { params: Promise<{ slug: string }> };

export const metadata = shareMetadata(
  'Join a community on Arpedia',
  'Join readers and authors in this Arpedia community.',
);

export default async function CommunityLink({ params }: Props) {
  const { slug } = await params;
  return (
    <ShareLanding
      info={{
        kicker: 'Community',
        title: 'Join this Arpedia community',
        body: 'Join readers and authors, and read together.',
        open: deepLink.community(slug),
      }}
    />
  );
}
