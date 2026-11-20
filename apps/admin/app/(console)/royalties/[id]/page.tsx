import { CycleScreen, cycleFor } from './screen';

export default async function CyclePage({ params }: { params: Promise<{ id: string }> }) {
  const r = await cycleFor((await params).id);
  return 'page' in r ? r.page : <CycleScreen c={r.c} staff={r.staff} />;
}
