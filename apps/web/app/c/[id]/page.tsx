import { ShareLanding, shareMetadata } from '@/components/share-landing';
import { deepLink } from '@/lib/share';

type Props = { params: Promise<{ id: string }> };

export const metadata = shareMetadata(
  'Join a reading club on Arpedia',
  'A friend invited you to a reading club on Arpedia. Read together, share highlights and chat about the chapter.',
);

// Shared from a club chat in the app (arpedia.africa/c/<id>).
export default async function ClubLink({ params }: Props) {
  const { id } = await params;
  return (
    <ShareLanding
      info={{
        kicker: 'Reading club',
        title: 'Join this reading club on Arpedia',
        body: 'A friend invited you. Read together, share highlights and chat about the chapter.',
        open: deepLink.club(id),
      }}
    />
  );
}
