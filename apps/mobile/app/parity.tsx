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
  IconButton,
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
import { StudioBooksView, StudioEarningsView, StudioHomeView } from '../features/11/StudioViews';
import {
  StudioClubView,
  StudioPayoutView,
  StudioProfileFoot,
  StudioProfileView,
} from '../features/11/StudioSettingsViews';
import { StudioInboxView, StudioPostView } from '../features/11/StudioCommsViews';
import {
  Apply1View,
  Apply2View,
  Apply3View,
  Apply4Foot,
  Apply4View,
  ApplyFoot,
  ApplySentFoot,
  ApplySentView,
  BecomeAuthorFoot,
  BecomeAuthorView,
} from '../features/11/ApplyViews';
import {
  StepFoot,
  SubmitChaptersView,
  SubmitDoneView,
  SubmitPreviewView,
  SubmitProcessingFoot,
  SubmitProcessingView,
  SubmitUploadView,
} from '../features/11/SubmitViews';
import {
  CommunityHero,
  InboxList,
  ReadTogether,
  UnreadBar,
  type InboxRowView,
  type InboxTab,
} from '../features/06/InboxViews';
import { DiscoverHero, DiscoverRow, TypeChips, type DiscoverRowView } from '../features/06/DiscoverViews';
import { Bubble, ComHead, ComPin, Composer, DayMarker, type BubbleView } from '../features/06/ChatViews';
import { OptionList, ReactionRow, ReportBody } from '../features/06/SheetViews';
import { BlockedRow } from '../features/06/BlockedViews';

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
  's-studio',
  's-studio-books',
  's-studio-royalties',
  's-studio-profile',
  's-studio-payout',
  's-studio-community',
  's-studio-post',
  's-studio-inbox',
  's-studio-submit',
  's-studio-processing',
  's-studio-chapters',
  's-studio-preview',
  's-studio-submitted',
  's-become-author',
  's-apply',
  's-apply-2',
  's-apply-3',
  's-apply-4',
  's-apply-sent',
  's-community',
  's-dms',
  's-community-groups',
  's-discover',
  's-channel',
  's-msg-actions',
  's-report',
  's-blocked',
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
        // WebView draws anything under 8px at 8px by default (WebSettings.minimumFontSize); Chrome
        // has no minimum, so the prototype's 7.5px cover authors would come out 7% too big.
        minimumFontSize={1}
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
        <View>{FLOW06.has(page) ? <Flow06 page={page} /> : <Flow01 page={page} />}</View>
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
      return <Flow11 page={page} />;
  }
}

// ─── Flow 11 screens with the prototype's values (tools/parity/s-studio*.html) ─
function Flow11({ page }: { page: Page }) {
  switch (page) {
    case 's-studio':
      return (
        <StudioHomeView
          go={noop}
          onDismissBanner={noop}
          m={{
            name: 'Ifeoma',
            stats: { books: '2', minutes: '41.2k', followers: '3.4k', earned: '₦184,304' },
            banner: true,
            suspended: null,
            noBooks: false,
            books: [
              { id: 'b1', title: 'Harmattan Letters', earned: '₦143,760', credits: '89,850', share: 0.78 },
              {
                id: 'b2',
                title: 'Morning Prayers, Volume 1',
                earned: '₦40,544',
                credits: '25,340',
                share: 0.22,
              },
            ],
            shortcuts: {
              messages: { sub: '4 waiting for a reply', count: 4 },
              club: 'Ifeoma’s Readers · 860 members',
              books: { sub: '2 live · 1 in review', count: 3 },
              posts: '12 new comments',
              earnings: { sub: 'Next payout 15 Dec', trail: '₦162,752' },
              visibility: 'Public',
              payout: 'GTBank ···· 2291 · verified',
              community: 'Who can post, slow mode',
            },
          }}
        />
      );
    case 's-studio-books':
      return (
        <StudioBooksView
          sub="2 live · 1 in review · 1 draft"
          state="ready"
          onBack={noop}
          onSubmit={noop}
          onAction={noop}
          onRetry={noop}
          books={[
            {
              id: 'b1',
              title: 'Harmattan Letters',
              tone: 'c1',
              status: 'update_in_review',
              label: 'Live',
              line: '2,104 readers · 4.7★ · 31.8k min this month',
              update: 'Update v2 in review · readers still see v1',
              issues: [],
              action: null,
            },
            {
              id: 'b2',
              title: 'Nine More Letters',
              tone: 'c7',
              status: 'changes_requested',
              label: 'Changes requested',
              line: null,
              update: null,
              issues: ['Editor: Chapter 3 repeats a page from chapter 2. Please re-upload.'],
              action: 'Upload new file',
            },
            {
              id: 'b3',
              title: 'Kaduna Nights',
              tone: 'c5',
              status: 'draft',
              label: 'Draft',
              line: 'Uploaded 10 Nov. Confirm your chapters and submit when ready.',
              update: null,
              issues: [],
              action: null,
            },
          ]}
        />
      );
    case 's-studio-profile':
      return (
        <>
          <StudioProfileView
            values={{
              pen_name: 'Ifeoma Nwachukwu',
              bio: 'Writes Christian fiction from Enugu. Harmattan Letters began as twelve letters in a notebook.',
              location: 'Enugu, Nigeria',
              visibility: 'public',
            }}
            photo={null}
            errors={{}}
            onChange={noop}
            onPhoto={noop}
            onPreview={noop}
            onBack={noop}
          />
          <StudioProfileFoot onSave={noop} />
        </>
      );
    case 's-studio-payout':
      return (
        <StudioPayoutView
          account={{
            bank: 'GTBank ···· 2291',
            name: 'IFEOMA C. NWACHUKWU',
            status: { label: 'Verified', tone: 'ok' },
          }}
          onBack={noop}
          onChange={noop}
        />
      );
    case 's-studio-community':
      return (
        <StudioClubView
          title="Ifeoma's Readers"
          sub="Club settings · 860 members"
          values={{ who: 'everyone', publicClub: true, slowMode: false }}
          mutedSub="3 words"
          moderatorsSub="Chioma, Kemi"
          onChange={noop}
          onBack={noop}
          onMuted={noop}
          onModerators={noop}
        />
      );
    case 's-studio-post':
      return (
        <StudioPostView
          values={{
            title: 'Why I wrote the letters first',
            body: 'Before there was a story there were twelve letters in a notebook my late uncle gave me…',
          }}
          book="Harmattan Letters"
          audience="3.4k followers + club"
          errors={{}}
          onChange={noop}
          onBook={noop}
          onPost={noop}
          onBack={noop}
        />
      );
    case 's-studio-inbox':
      return (
        <StudioInboxView
          filter="waiting"
          waiting={4}
          state="ready"
          rows={[
            {
              id: '1',
              name: 'Ngozi Eze',
              tone: 'g',
              preview: 'Is the man who fixes the gate the same one…',
              time: '09:14',
            },
            {
              id: '2',
              name: 'Kemi O.',
              tone: 't',
              preview: 'Will there be a sequel? My whole fellowship…',
              time: 'Yesterday',
            },
            {
              id: '3',
              name: 'Tolu A.',
              tone: 'b',
              preview: 'Thank you for chapter 4. I lost my husband in…',
              time: '10 Nov',
            },
          ]}
          onFilter={noop}
          onRow={noop}
          onRetry={noop}
          onBack={noop}
        />
      );
    case 's-become-author':
      return (
        <>
          <BecomeAuthorView onBack={noop} />
          <BecomeAuthorFoot label="Start application" onPress={noop} />
        </>
      );
    case 's-apply':
      return (
        <>
          {/* The app adds Date of birth and State (Default Q3); the prototype has neither. */}
          <Apply1View
            values={{
              legal_name: 'Ngozi Eze',
              email: 'ngozi.eze@example.com',
              dob: '',
              state: '',
              phone: '',
              pen_name: '',
              social_handle: '',
            }}
            errors={{}}
            saved="Draft saves as you type"
            onChange={noop}
            onBack={noop}
          />
          <ApplyFoot onContinue={noop} onSave={noop} onCancel={noop} />
        </>
      );
    case 's-apply-2':
      return (
        <>
          <Apply2View
            categories={['Christian fiction', 'African stories']}
            bio="Choir alto from Enugu. I write about faith, family and the small mercies of city life."
            experience="2 self-published novellas, a church magazine column"
            errors={{}}
            saved="Draft saves as you type"
            onToggle={noop}
            onBio={noop}
            onExperience={noop}
            onBack={noop}
          />
          <ApplyFoot onContinue={noop} onSave={noop} onCancel={noop} />
        </>
      );
    case 's-apply-3':
      return (
        <>
          <Apply3View
            file={{ name: 'the-gatekeeper-ch1.docx', meta: '220 KB · 8 pages' }}
            sampleText=""
            saved="Draft saves as you type"
            onPick={noop}
            onRemove={noop}
            onText={noop}
            onBack={noop}
          />
          <ApplyFoot onContinue={noop} onSave={noop} onCancel={noop} />
        </>
      );
    case 's-apply-4':
      return (
        <>
          <Apply4View
            rows={[
              { k: 'Name', v: 'Ngozi Eze' },
              { k: 'Pen name', v: 'N. C. Eze' },
              { k: 'Writes', v: 'Christian fiction, African stories' },
              { k: 'Sample', v: 'the-gatekeeper-ch1.docx' },
            ]}
            agree
            onAgree={noop}
            onBack={noop}
          />
          <Apply4Foot canSend onSend={noop} onEdit={noop} />
        </>
      );
    case 's-apply-sent':
      return (
        <>
          <ApplySentView replyBy="Monday 16 November" sentOn="12 November" onClose={noop} />
          <ApplySentFoot onStudio={noop} />
        </>
      );
    case 's-studio-submit':
      return (
        <>
          <SubmitUploadView
            values={{
              source: 'docx',
              title: 'Market Day in Onitsha',
              subtitle: '',
              genres: ['African stories', 'Fiction'],
              description: '',
            }}
            file={{ name: 'market-day-in-onitsha-final.docx', line: '2.1 MB · uploaded' }}
            cover={null}
            errors={{}}
            onChange={noop}
            onPickFile={noop}
            onRemoveFile={noop}
            onPickCover={noop}
            onRemoveCover={noop}
            onBack={noop}
          />
          <StepFoot label="Continue" onPress={noop} />
        </>
      );
    case 's-studio-processing':
      return (
        <>
          <SubmitProcessingView
            sub="This takes 1 to 3 minutes."
            steps={[
              { label: 'Reading your file', state: 'done' },
              { label: 'Cleaning text and quotes', state: 'done' },
              { label: 'Finding chapters', state: 'now' },
              { label: 'Building the free 10% preview', state: 'todo' },
              { label: 'Checking cover and content', state: 'todo' },
            ]}
            progress={0.5}
            note="Nothing for you to do here. You can leave this screen; we'll send a notification when your chapters are ready to check."
            onBack={noop}
          />
          <SubmitProcessingFoot ready onReady={noop} onLeave={noop} />
        </>
      );
    case 's-studio-chapters':
      return (
        <>
          <SubmitChaptersView
            sub="We found 22 chapters in Market Day in Onitsha."
            flags={[
              { tone: 'warn', text: 'Chapter 4 has no title. Add one?' },
              { tone: 'info', text: 'Image on page 41 is too large, we’ll shrink it.' },
              {
                tone: 'info',
                text: 'Chapter 17 runs to 31 pages, so we split it into two parts. Readers who pay as they read pay for it in two smaller steps.',
              },
            ]}
            chapters={[
              { ord: 0, title: 'The Road to the Market', words: 2940, canMerge: false },
              { ord: 1, title: 'Mama Nkechi’s Stall', words: 3120, canMerge: false },
              { ord: 2, title: 'Bargains and Whispers', words: 2780, canMerge: false },
              { ord: 3, title: null, words: 2610, canMerge: true },
              { ord: 4, title: 'The Trader from Aba', words: 3350, canMerge: false },
              { ord: 5, title: 'Rain Over Main Market', words: 2490, canMerge: false },
              { ord: 6, title: 'A Debt Remembered', words: 180, canMerge: true },
            ]}
            note="Showing 7 of 22. Scroll to see all chapters."
            totals={{ words: '62,400 words', pages: '250 pages', price: '125 credits · ₦375' }}
            onRename={noop}
            onMerge={noop}
            onBack={noop}
          />
          <StepFoot label="Looks right, continue" onPress={noop} />
        </>
      );
    case 's-studio-preview':
      return (
        <>
          <SubmitPreviewView
            pages={[
              {
                label: 'First page',
                title: 'The Road to the Market',
                paras: [
                  'Before the cocks had finished their quarrel, Mama Nkechi was already on the road, a basket of yams balanced on her head and the whole of Onitsha stirring around her.',
                  'She did not look back. Market day waited for no one.',
                ],
              },
              {
                label: 'Chapter 9, page 3',
                paras: [
                  '“You will not sell that cloth for such a price,” the trader said, laughing, and the crowd leaned in to hear what the old woman would answer.',
                  'She smiled, folded the cloth once, and named a number that made him stop laughing altogether.',
                ],
              },
              {
                label: 'Chapter 3, page 8',
                paras: [
                  'By noon the heat sat on the stalls like a hand. Ada counted the coins twice, then a third time, as if the count itself might change.',
                ],
                end: 'The free preview ends here (10%)',
              },
            ]}
            readiness={92}
            readinessLabel="Ready for review"
            checklist={[
              { k: 'File read and cleaned', v: 'Done' },
              { k: '22 chapters confirmed', v: 'Done' },
              { k: 'Free 10% preview', v: 'Built' },
              { k: 'Cover', v: 'Good size' },
              { k: 'Chapter 4 title', v: 'Still to add' },
            ]}
            price={{ k: '62,400 words → 250 pages', v: '125 credits (₦375)' }}
            earn="₦200"
            agreed={false}
            onAgree={noop}
            onBack={noop}
          />
          <StepFoot label="Submit for review" onPress={noop} />
        </>
      );
    case 's-studio-submitted':
      return (
        <>
          <SubmitDoneView
            title="Market Day in Onitsha is in!"
            sub="Our team will review it within 3 days. Most reviews take 5 minutes."
            price={{ k: '62,400 words → 250 pages', v: '125 credits (₦375)' }}
            earn="₦1.60 a credit · ₦200 a full read"
            submittedOn="12 November"
            onClose={noop}
          />
          <StepFoot label="Back to My books" onPress={noop} />
        </>
      );
    case 's-studio-royalties':
      return (
        <StudioEarningsView
          sub="October · paid after a 30-day hold"
          total="₦162,752"
          state="ready"
          onBack={noop}
          onRetry={noop}
          rows={[
            { k: 'Unlock all · 78,400 credits', v: '₦125,440' },
            { k: 'Pay as you read · 23,320 credits', v: '₦37,312' },
            { k: '101,720 credits × ₦1.60', v: '₦162,752', total: true },
          ]}
          payouts={[
            {
              month: 'October',
              sub: 'To GTBank ···· 2291',
              amount: '₦162,752',
              pill: { label: 'Releases 15 Dec', tone: 'warn' },
            },
            {
              month: 'September',
              sub: 'Paid 15 Nov',
              amount: '₦98,400',
              pill: { label: 'Paid', tone: 'ok' },
            },
          ]}
        />
      );
    default:
      return null;
  }
}

// ─── Flow 06 screens with the prototype's values (tools/parity/s-*.html) ────
const FLOW06 = new Set<Page>([
  's-community',
  's-dms',
  's-community-groups',
  's-discover',
  's-channel',
  's-msg-actions',
  's-report',
  's-blocked',
]);

const msg = (
  b: Partial<BubbleView> & Pick<BubbleView, 'key' | 'senderName' | 'body' | 'time'>,
): BubbleView => ({
  me: false,
  senderTone: 'o',
  author: false,
  ...b,
});
const CHAT: BubbleView[] = [
  msg({
    key: 'm1',
    senderName: 'Chioma Okafor',
    body: 'The night vigil chapter 😭 who else cried?',
    time: '19:02',
    reactions: '😭 6 · 🙏 3',
  }),
  msg({
    key: 'm2',
    senderName: 'Ifeoma Nwachukwu',
    senderTone: 'm',
    author: true,
    body: "I cried writing it. My mother's vigil songs are in there.",
    time: '19:05',
  }),
  msg({
    key: 'm3',
    me: true,
    senderName: 'Ngozi Eze',
    body: 'This one is for everyone waiting on God 🙏🏾',
    quote: {
      text: '“Grace did not ask her to be ready. It only asked her to come.”',
      source: 'Harmattan Letters · Ch. 7',
    },
    time: '19:11 · Seen',
  }),
];

/** The kit Sheet's body (`.panel .pb`: padding 4 18 28, gap 14), laid flat like the reference. */
function SheetBody({ children }: { children: React.ReactNode }) {
  const { c, s } = useTheme();
  return (
    <View
      style={{
        backgroundColor: c.white,
        paddingTop: s(4),
        paddingHorizontal: s(18),
        paddingBottom: s(28),
        gap: s(14),
      }}
    >
      {children}
    </View>
  );
}

const DISCOVER: DiscoverRowView[] = [
  [
    'ao',
    'Arpedia Official',
    'o',
    'Official · public · 12.4k members',
    'Announcements, new releases and reading challenges.',
    true,
  ],
  [
    'gr',
    'Grace Readers',
    'n',
    'Group · public · 1,240 members · live now',
    'Christian fiction book club. This week: Harmattan Letters ch. 7–9.',
    true,
  ],
  [
    'ir',
    "Ifeoma's Readers",
    'm',
    'Author · public · 860 members',
    'The official community for readers of Ifeoma Nwachukwu.',
    true,
  ],
  [
    'hl',
    'Harmattan Letters Read-Along',
    'b',
    'Read-along · public · 64 members',
    'Week-by-week discussion. Please mark spoilers.',
    true,
  ],
  [
    'fb',
    'Faith & Books',
    'k',
    'Group · public · 2.1k members',
    'Christian and faith-based reading, devotionals and testimonies.',
    false,
  ],
  [
    'sr',
    'Short Reads Lounge',
    't',
    'Group · public · 540 members',
    'Quick stories for quick commutes. Share the ones you finished on the danfo.',
    false,
  ],
  [
    'un',
    'UNN Christian Fellowship Books',
    'g',
    'Group · public · 386 members',
    'Campus reading group. Next pick vote closes Friday.',
    false,
  ],
].map(([id, name, tone, type, description, joined]) => ({
  id: id as string,
  name: name as string,
  tone: tone as DiscoverRowView['tone'],
  type: type as string,
  description: description as string,
  joined: joined as boolean,
}));

const row = (
  id: string,
  name: string,
  tone: InboxRowView['tone'],
  sub: string,
  time: string,
  unread = 0,
  extra: Partial<InboxRowView> = {},
): InboxRowView => ({
  id,
  name,
  tone,
  sub,
  time,
  unread,
  person: false,
  live: false,
  author: false,
  muted: false,
  ...extra,
});

const GR = row('gr', 'Grace Readers', 'n', 'Chioma: The night vigil chapter 😭 who else cried?', 'now', 8, {
  live: true,
});
const IN = row(
  'in',
  'Ifeoma Nwachukwu',
  'm',
  'Ifeoma: Thank you Ngozi! Chapter 12 will answer that 😊',
  '45m',
  1,
  {
    person: true,
    author: true,
  },
);
const IR = row(
  'ir',
  "Ifeoma's Readers",
  'm',
  'Ifeoma: A small treat: I will answer three questions on Friday',
  '1h',
  3,
);
const AO = row(
  'ao',
  'Arpedia Official',
  'o',
  'Arpedia Team: Reading challenge: finish one book this month to enter the free-year draw',
  '3h',
  2,
);
const HL = row(
  'hl',
  'Harmattan Letters Read-Along',
  'b',
  'Hauwa: Friday we move to chapter 9. Catch up!',
  '5h',
);
const AS = row(
  'as',
  'Arpedia Support',
  'k',
  'Arpedia Team: Hello Ngozi, welcome to Arpedia. Ask us anything here.',
  '4d',
);

function Flow06({ page }: { page: Page }) {
  const { c, s } = useTheme();
  if (page === 's-channel')
    return (
      <>
        <ComHead
          name="Grace Readers"
          tone="n"
          status="14 reading now · 1,240 members"
          onBack={noop}
          onInfo={noop}
        />
        <ComPin title="This week: Harmattan Letters ch. 7–9" note="Vigil call Friday 8 pm" onPress={noop} />
        {/* .chat: gap 10, padding 14 12 */}
        <View
          style={{ gap: s(10), paddingVertical: s(14), paddingHorizontal: s(12), backgroundColor: c.white }}
        >
          <DayMarker label="Today" />
          {CHAT.map((m) => (
            <Bubble key={m.key} m={m} onLongPress={noop} />
          ))}
        </View>
        <Composer
          value=""
          onChange={noop}
          onSend={noop}
          onPlus={noop}
          placeholder="Message Grace Readers"
          bottom={s(24)}
        />
      </>
    );
  if (page === 's-msg-actions')
    return (
      <SheetBody>
        <ReactionRow mine={null} onReact={noop} />
        <OptionList
          items={[
            { key: 'reply', title: 'Reply', onPress: noop },
            { key: 'share', title: 'Share', onPress: noop },
            { key: 'pin', title: 'Pin', sub: 'Club admins only', onPress: noop },
            { key: 'copy', title: 'Copy text', onPress: noop },
            { key: 'report', title: 'Report or block', sub: 'Chioma Okafor', danger: true, onPress: noop },
          ]}
        />
      </SheetBody>
    );
  if (page === 's-report')
    return (
      <SheetBody>
        <ReportBody
          name="Chioma Okafor"
          reason="harassment"
          details=""
          alsoBlock={false}
          canBlock
          onReason={noop}
          onDetails={noop}
          onAlsoBlock={noop}
          onCancel={noop}
          onSend={noop}
        />
      </SheetBody>
    );
  if (page === 's-blocked')
    return (
      <View style={{ paddingBottom: s(28) }}>
        <Hero
          barBack
          bar={<IconButton icon="back" label="Back" onPress={noop} color={c.onOrg} />}
          title="Blocked people"
          sub="Blocked people can't message you and their posts are hidden. They aren't told."
        />
        <View style={{ paddingTop: s(8) }}>
          <BlockedRow
            name="Tunde K."
            tone="b"
            sub="Blocked 2 Nov · from Grace Readers"
            divider={false}
            onUnblock={noop}
          />
          <BlockedRow name="Jide M." tone="k" sub="Blocked 14 Oct · from messages" divider onUnblock={noop} />
        </View>
      </View>
    );
  if (page === 's-discover')
    return (
      <View style={{ paddingBottom: s(28) }}>
        <DiscoverHero query="" onQuery={noop} onBack={noop} />
        <TypeChips value="all" onChange={noop} />
        <View style={{ paddingTop: s(8) }}>
          {DISCOVER.map((r, i) => (
            <DiscoverRow key={r.id} row={r} divider={i > 0} onOpen={noop} onJoin={noop} />
          ))}
        </View>
      </View>
    );
  const tab: InboxTab = page === 's-dms' ? 'unread' : page === 's-community-groups' ? 'groups' : 'all';
  const hero = (
    <CommunityHero tab={tab} counts={{ all: 5, unread: 4 }} onTab={noop} onRooms={noop} onDiscover={noop} />
  );
  // .body.body-end: padding-bottom 28
  return (
    <View style={{ paddingBottom: s(28) }}>
      {hero}
      {page === 's-community' ? (
        <>
          <InboxList rows={[GR, IN, IR, AO, HL, AS]} onOpen={noop} />
          <ReadTogether
            rooms={{
              people: [
                { name: 'Chioma Okafor', tone: 'm' },
                { name: 'Ifeoma Nwachukwu', tone: 'o' },
                { name: 'Musa Danjuma', tone: 'k' },
              ],
              readingNow: 5,
              books: [
                { title: 'The Alignment', tone: 'c3' },
                { title: 'Harmattan Letters', tone: 'c1' },
              ],
            }}
            onRooms={noop}
            onDiscover={noop}
          />
        </>
      ) : page === 's-dms' ? (
        <>
          <UnreadBar count={4} onMarkAll={noop} />
          <InboxList rows={[GR, IN, IR, AO]} onOpen={noop} />
        </>
      ) : (
        <InboxList
          rows={[
            { ...GR, sub: 'Club · 1,240 members · reading Harmattan Letters' },
            { ...IR, sub: 'Author community · 860 members' },
            { ...AO, sub: 'Official · 12.4k members · announcements' },
            { ...HL, sub: 'Read-along · 64 members' },
          ]}
          onOpen={noop}
        />
      )}
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
