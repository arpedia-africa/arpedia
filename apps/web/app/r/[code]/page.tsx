import type { Metadata } from 'next';
import { ShareLanding, shareMetadata } from '@/components/share-landing';
import { cleanCode, deepLink } from '@/lib/share';

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const code = cleanCode((await params).code);
  return shareMetadata(
    'Join my reading room on Arpedia',
    code
      ? `Join my reading room on Arpedia. Code ${code}.`
      : 'Join my reading room on Arpedia and read together.',
  );
}

// Shared from a reading room in the app (arpedia.africa/r/<code>). The app opens with the code filled in.
export default async function RoomLink({ params }: Props) {
  const code = cleanCode((await params).code);
  return (
    <ShareLanding
      info={{
        kicker: 'Reading room',
        title: 'Join my reading room on Arpedia',
        body: code
          ? 'Open the app and enter this code to come in. It is filled in for you when the link opens the app.'
          : 'Open the app and join the room to read together.',
        code: code || undefined,
        open: deepLink.room(code),
      }}
    />
  );
}
