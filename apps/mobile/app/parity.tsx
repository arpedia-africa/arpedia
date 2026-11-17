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
import { kitEnabled } from '@/lib/kit';

/**
 * Pixel-gate pages for `node tools/parity.mjs` (kit builds only). Each page mirrors
 * tools/parity/<page>.html one to one: the prototype's elements inside the same harness layout
 * (.pk = column, padding 16, gap 12; .pk-row = wrapping row, gap 8, centred).
 * Opened with arpedia://parity?page=kit-a&theme=palm (add &ref=<port> for the prototype reference).
 */
export default function ParityScreen() {
  const params = useLocalSearchParams<{ page?: string; theme?: string; ref?: string }>();
  const theme = (THEMES as string[]).includes(params.theme ?? '') ? (params.theme as ThemeName) : 'sunflower';
  const page = params.page === 'kit-b' ? 'kit-b' : 'kit-a';
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

function Page({ page, theme }: { page: 'kit-a' | 'kit-b'; theme: ThemeName }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const t = setTimeout(() => ready(page, theme, 'build', insets.top), 300);
    return () => clearTimeout(t);
  }, [page, theme, insets.top]);
  return (
    <View style={{ flex: 1, backgroundColor: c.white, paddingTop: insets.top }}>
      <StatusBar style="dark" />
      {page === 'kit-a' ? <KitA /> : <KitB />}
    </View>
  );
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
