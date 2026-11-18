import { useEffect } from 'react';
import { LogBox, PixelRatio, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import {
  AppIcon,
  Avatar,
  Btn,
  Cell,
  Chip,
  Count,
  Field,
  Group,
  GroupLabel,
  Hero,
  Pill,
  TabBar,
  ThemeProvider,
  Toggle,
  THEMES,
  Wordmark,
  useTheme,
  type ThemeName,
} from '@arpedia/ui';
import { LAUNCH_PLANS } from '@arpedia/core';
import { kitEnabled } from '@/lib/kit';
import { LoginView, SignupView } from '../features/01/AuthViews';
import {
  AllSetBody,
  AllSetFoot,
  AllSetHero,
  BookLead,
  PaywallBody,
  PaywallFoot,
  PaywallHero,
  PersonLead,
} from '../features/01/PaywallViews';
import {
  Foot,
  InterestsFoot,
  InterestsView,
  ProfileFoot,
  ProfileView,
  RoleView,
  ThemeView,
  type GenreOption,
} from '../features/01/StepViews';

const PAGES = [
  'kit-a',
  'kit-b',
  's-login',
  's-signup',
  's-interests',
  's-theme',
  's-role',
  's-profile-setup',
  's-plans-onboard',
  's-all-set',
] as const;
type Page = (typeof PAGES)[number];

/**
 * Pixel-gate pages for `node tools/parity.mjs` (kit builds only). Each page mirrors
 * tools/parity/<page>.html one to one: the prototype's elements inside the same harness layout
 * (.pk = column, padding 16, gap 12; .pk-row = wrapping row, gap 8, centred).
 * Opened with arpedia://parity?page=kit-a&theme=palm (add &ref=<port> for the prototype reference).
 */
export default function ParityScreen() {
  const params = useLocalSearchParams<{ page?: string; theme?: string; ref?: string }>();
  const theme = (THEMES as string[]).includes(params.theme ?? '') ? (params.theme as ThemeName) : 'sunflower';
  const page = (PAGES as readonly string[]).includes(params.page ?? '') ? (params.page as Page) : 'kit-a';
  // Dev builds: no LogBox toasts over the captures.
  useEffect(() => LogBox.ignoreAllLogs(), []);
  if (!kitEnabled) return <Redirect href="/" />;
  return (
    <ThemeProvider key={theme} theme={theme} width={375} reduceMotion>
      {params.ref ? (
        <Reference page={page} theme={theme} port={params.ref} />
      ) : (
        <Page page={page} theme={theme} />
      )}
    </ThemeProvider>
  );
}

// tools/parity.mjs waits for this line, then crops the capture below the status bar.
const ready = (page: string, theme: string, kind: 'build' | 'ref', top: number, h = '') =>
  console.log(
    `PARITY_READY page=${page} theme=${theme} kind=${kind} top=${Math.round(top * PixelRatio.get())}${h && ` h=${h}`}`,
  );

/**
 * The prototype reference, drawn on the same phone by Android's WebView so both sides of the pixel
 * gate use the same text rasteriser. parity.mjs serves the page on the PC (adb reverse tcp:<port>);
 * plain http to localhost loads in debug builds and kit release builds (plugins/kit-localhost.js).
 */
function Reference({ page, theme, port }: { page: string; theme: string; port: string }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.white, paddingTop: insets.top }}>
      <StatusBar style="dark" />
      <WebView
        key={`${page}-${theme}`}
        source={{ uri: `http://127.0.0.1:${Number(port)}/ref?page=${page}&theme=${theme}` }}
        textZoom={100}
        scrollEnabled={false}
        overScrollMode="never"
        style={{ flex: 1, backgroundColor: c.white }}
        onMessage={(e) => {
          const [msg, h] = e.nativeEvent.data.split(':');
          if (msg === 'ready') ready(page, theme, 'ref', insets.top, h);
        }}
      />
    </View>
  );
}

function Page({ page, theme }: { page: Page; theme: ThemeName }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const t = setTimeout(() => ready(page, theme, 'build', insets.top), 300);
    return () => clearTimeout(t);
  }, [page, theme, insets.top]);
  return (
    <View style={{ flex: 1, backgroundColor: c.white, paddingTop: insets.top }}>
      <StatusBar style="dark" />
      {page === 'kit-a' ? (
        <KitA />
      ) : page === 'kit-b' ? (
        <KitB />
      ) : (
        // A screen at its natural height, like the reference's height:auto .screen (body, then foot).
        <View>
          <Flow01 page={page} />
        </View>
      )}
    </View>
  );
}

// ─── Flow 01 screens with the prototype's values (tools/parity/s-*.html) ────
const GENRES: GenreOption[] = [
  'Fiction',
  'Christian',
  'Christian romance',
  'Nigerian books',
  'African literature',
  'Faith',
  'Romance',
  'Drama',
  'Short reads',
  'Personal growth',
].map((name) => ({ id: name, name }));

const FAN = [
  { id: 'b1', title: 'Harmattan Letters', author: 'Ifeoma Nwachukwu' },
  { id: 'b2', title: 'A House Called Grace', author: 'Kemi Ogunleye' },
  { id: 'b3', title: 'Still Waters, Lagos', author: 'Chioma Okafor' },
];

function Flow01({ page }: { page: Page }) {
  switch (page) {
    case 's-login':
      return (
        <LoginView
          values={{ email: '', password: '' }}
          errors={{}}
          onChange={noop}
          onSubmit={noop}
          onGoogle={noop}
          onForgot={noop}
          onCreate={noop}
        />
      );
    case 's-signup':
      return (
        <SignupView
          values={{ name: '', email: '', password: '' }}
          errors={{}}
          onChange={noop}
          onSubmit={noop}
          onGoogle={noop}
          onLogin={noop}
          onTerms={noop}
          onPrivacy={noop}
        />
      );
    case 's-interests':
      return (
        <>
          <InterestsView
            genres={GENRES}
            picked={new Set(['Fiction', 'Nigerian books'])}
            onToggle={noop}
            onBack={noop}
          />
          <InterestsFoot onSkip={noop} onContinue={noop} />
        </>
      );
    case 's-theme':
      return <ThemeView value="sunflower" onPick={noop} onBack={noop} onSkip={noop} onContinue={noop} />;
    case 's-role':
      return (
        <>
          <RoleView value="reader" onPick={noop} onBack={noop} />
          <Foot>
            <Btn label="Continue" iconAfter="arrow" block />
          </Foot>
        </>
      );
    case 's-profile-setup':
      return (
        <>
          <ProfileView
            values={{ name: 'Ngozi Eze', phone: '', dob: '', country: 'NG' }}
            errors={{}}
            countryName="Nigeria"
            callingCode="234"
            onChange={noop}
            onPhoto={noop}
            onCountry={noop}
            onBack={noop}
          />
          <ProfileFoot canContinue onContinue={noop} onSkip={noop} />
        </>
      );
    case 's-plans-onboard': {
      const plans = LAUNCH_PLANS.filter((p) => p.id !== 'monthly');
      return (
        <>
          <PaywallHero
            title="Ngozi, your shelf is ready"
            sub="412 books in Christian & Faith, Clean romance and African stories. Start reading tonight."
            books={FAN}
            onClose={noop}
            onRestore={noop}
          />
          <PaywallBody plans={plans} selected={plans[0]!} reminderDay={87} onSelect={noop} onMore={noop} />
          <PaywallFoot plan={plans[0]!} onContinue={noop} onOffline={noop} onTerms={noop} onPrivacy={noop} />
        </>
      );
    }
    case 's-all-set':
      return (
        <>
          <AllSetHero credits={800} planLine="Quarterly · renews 12 Feb" />
          <AllSetBody
            steps={[
              {
                key: 'book',
                title: 'Read the #2 book this week',
                sub: 'Harmattan Letters · 125 credits',
                lead: <BookLead title="Harmattan Letters" />,
                onPress: noop,
              },
              {
                key: 'club',
                title: 'Join Grace Readers',
                sub: '1,240 members · reading chapter 8',
                onPress: noop,
              },
              {
                key: 'author',
                title: 'Follow Ifeoma Nwachukwu',
                sub: 'Christian fiction · 3 books',
                lead: <PersonLead name="Ifeoma Nwachukwu" />,
                onPress: noop,
              },
            ]}
          />
          <AllSetFoot onHome={noop} />
        </>
      );
    default:
      return null;
  }
}

function Pk({ children }: { children: React.ReactNode }) {
  const { s } = useTheme();
  return <View style={{ flexDirection: 'column', gap: s(12), padding: s(16) }}>{children}</View>;
}

function PkRow({ children }: { children: React.ReactNode }) {
  const { s } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(8), alignItems: 'center' }}>
      {children}
    </View>
  );
}

const noop = () => {};

function KitA() {
  const { s } = useTheme();
  return (
    <>
      <Hero
        bar={
          <>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
              <AppIcon size={26} />
              <Wordmark night height={20} />
            </View>
            <Pill label="840" tone="night" />
          </>
        }
        title="Hero band"
        sub="Main tabs, book and author pages, celebrations."
      />
      <Pk>
        <Btn label="Primary" block />
        <Btn label="Secondary" variant="s" block />
        <Btn label="Night" variant="n" block />
        <Btn label="Outline" variant="g" block />
        <Btn label="Disabled" disabled block />
        <Btn label="Destructive" variant="x" block />
        <PkRow>
          <Btn label="Medium" size="md" />
          <Btn label="Small" size="sm" />
        </PkRow>
        <PkRow>
          <Chip label="Selected filter" state="on" />
          <Chip label="Filter" />
          <Chip label="Chosen option" state="sel" />
        </PkRow>
        <PkRow>
          <Pill label="840 credits" />
          <Pill label="Live" tone="night" />
          <Pill label="Live" tone="ok" />
          <Pill label="In review" tone="info" />
        </PkRow>
        <PkRow>
          <Toggle value onChange={noop} label="On example" />
          <Toggle value={false} onChange={noop} label="Off example" />
        </PkRow>
      </Pk>
    </>
  );
}

function KitB() {
  const { s } = useTheme();
  return (
    <>
      <Pk>
        <Field label="Default" placeholder="you@example.com" />
        <Field label="Focused" value="Ngozi Eze" focusedLook />
        <Field label="Error" value="ngozi@" error="Enter a full email address." />
      </Pk>
      <View style={{ paddingTop: s(16), gap: s(12) }}>
        <GroupLabel>Grouped list</GroupLabel>
        <Group>
          <Cell title="Cell title" sub="Supporting line" chevron />
          <Cell
            title="With avatar"
            lead={<Avatar name="Ifeoma Nwachukwu" size="sm" tone="m" />}
            trail={<Count value={2} />}
          />
        </Group>
      </View>
      <TabBar active="home" onChange={noop} />
    </>
  );
}
