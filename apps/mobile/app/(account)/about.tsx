import { Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import * as Application from 'expo-application';
import * as Clipboard from 'expo-clipboard';
import * as Device from 'expo-device';
import { Screen, useToast } from '@arpedia/ui';
import { PRIVACY_URL, TERMS_URL } from '@arpedia/core';
import { useSession } from '../../features/01/session';
import { AboutView } from '../../features/10/SettingsViews';
import { useTrack } from '../../features/14/analytics';

// Flow 10 · About and help (s-about, rule 33). One support address everywhere.
const SUPPORT = 'support@arpedia.africa';

export default function About() {
  const toast = useToast();
  const track = useTrack();
  const uid = useSession()?.user.id;
  const version = Application.nativeApplicationVersion ?? '1.0.0';
  const build = Application.nativeBuildVersion ?? '1';

  // Flow 14 rule 34: the email carries what support needs to find the reader and the build.
  const contact = () => {
    const device = [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || 'Unknown';
    const os = `${Platform.OS === 'android' ? 'Android' : 'iOS'} ${Device.osVersion ?? ''}`.trim();
    const body = [
      '',
      '',
      '---',
      `App: ${version} (build ${build})`,
      `Phone: ${device}, ${os}`,
      `Account: ${uid ?? 'not signed in'}`,
    ].join('\n');
    const url = `mailto:${SUPPORT}?subject=${encodeURIComponent('Arpedia support')}&body=${encodeURIComponent(body)}`;
    track('contact_support_opened');
    Linking.openURL(url).catch(() => toast({ message: `No email app found. Write to ${SUPPORT}` }));
  };

  return (
    <Screen top="org">
      <AboutView
        version={version}
        build={build}
        onBack={() => router.back()}
        onHelp={() => void Linking.openURL('https://arpedia.africa/help')}
        onContact={contact}
        onCopy={() =>
          void Clipboard.setStringAsync(SUPPORT).then(
            () => toast({ message: 'Copied' }),
            () => toast({ message: "Couldn't copy that. Try again." }),
          )
        }
        onTerms={() => void Linking.openURL(TERMS_URL)}
        onPrivacy={() => void Linking.openURL(PRIVACY_URL)}
        onCopyright={() => void Linking.openURL(`mailto:${SUPPORT}?subject=Copyright%20report`)}
      />
    </Screen>
  );
}
