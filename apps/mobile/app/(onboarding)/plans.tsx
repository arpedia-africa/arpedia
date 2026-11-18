import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { saveStep } from '../../features/01/steps';

// WIP(01): s-plans-onboard is built in the next step. Reaching the paywall already finishes
// onboarding (rule 29), so until then this records it and goes Home.
export default function Plans() {
  useEffect(() => {
    void saveStep('plans');
  }, []);
  return <Redirect href="/home" />;
}
