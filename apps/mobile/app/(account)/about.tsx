import { Linking, Share } from 'react-native';
import { router } from 'expo-router';
import * as Application from 'expo-application';
import { Screen } from '@arpedia/ui';
import { PRIVACY_URL, TERMS_URL } from '@arpedia/core';
import { AboutView } from '../../features/10/SettingsViews';

// Flow 10 · About and help (s-about, rule 33). One support address everywhere.
const SUPPORT = 'support@arpedia.africa';

export default function About() {
  return (
    <Screen top="org">
      <AboutView
        version={Application.nativeApplicationVersion ?? '1.0.0'}
        build={Application.nativeBuildVersion ?? '1'}
        onBack={() => router.back()}
        onHelp={() => void Linking.openURL('https://arpedia.africa/help')}
        // The share sheet carries Copy on Android (no clipboard module in this build yet).
        onCopy={() => void Share.share({ message: SUPPORT })}
        onTerms={() => void Linking.openURL(TERMS_URL)}
        onPrivacy={() => void Linking.openURL(PRIVACY_URL)}
        onCopyright={() => void Linking.openURL(`mailto:${SUPPORT}?subject=Copyright%20report`)}
      />
    </Screen>
  );
}
