import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { ConfigView, type ConfigScreen } from './client';
import type { ForceUpdateImpact } from './impact';

export const metadata: Metadata = { title: 'App configuration · Arpedia Admin' };

const ENV: Record<string, string> = { production: 'Production', staging: 'Staging' };

/** s-config: versions, force update, maintenance mode, feature flags, OTA and remote copy. */
export default async function ConfigPage() {
  const staff = await requireStaff();
  if (!canOpen('config', staff.permissions)) return <NoAccess page="config" label="App configuration" role={staff.role} />;
  const supabase = await serverSupabase();
  const [{ data, error }, impact] = await Promise.all([supabase.rpc('get_config_screen'), supabase.rpc('force_update_impact')]);
  if (error) throw error;
  return (
    <ConfigView
      screen={data as unknown as ConfigScreen}
      impact={impact.error ? null : (impact.data as unknown as ForceUpdateImpact)}
      env={ENV[process.env.NEXT_PUBLIC_APP_ENV ?? ''] ?? 'Local'}
    />
  );
}
