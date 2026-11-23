import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BannerEditPage } from '../edit-page';

export const metadata: Metadata = { title: 'Edit announcement · Arpedia Admin' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <BannerEditPage id={id} />;
}
