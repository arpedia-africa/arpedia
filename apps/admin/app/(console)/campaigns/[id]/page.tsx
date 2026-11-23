import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ComposePage } from '../compose-page';

export const metadata: Metadata = { title: 'Compose push · Arpedia Admin' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <ComposePage id={id} />;
}
