import type { Metadata } from 'next';
import { BannerEditPage } from '../edit-page';

export const metadata: Metadata = { title: 'New announcement · Arpedia Admin' };

export default function NewBannerPage() {
  return <BannerEditPage id={null} />;
}
