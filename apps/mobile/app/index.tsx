import { Redirect } from 'expo-router';
import { kitEnabled } from '@/lib/kit';

// Flow 01 replaces this with the session check (welcome / onboarding / home).
// Until then, development builds open the kit gallery.
export default function Index() {
  return <Redirect href={kitEnabled ? '/kit' : '/home'} />;
}
