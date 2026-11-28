// Flow 10 screens with the prototype's sample values, for tools/parity (pages tools/parity/s-*.html).
import { View } from 'react-native';
import { useTheme } from '@arpedia/ui';
import { CollectionView, type CollectionPage } from './CollectionViews';
import { EditProfileFoot, EditProfileView } from './EditProfileViews';
import { GoalBody, ProfileView } from './ProfileViews';
import {
  AboutView,
  DeleteAccountFoot,
  DeleteAccountView,
  NotifPrefsView,
  SecurityView,
  SettingsView,
  ThemeBody,
  type SettingsActions,
} from './SettingsViews';

const PAGES10 = [
  's-profile',
  's-goal',
  's-my-highlights',
  's-account',
  's-theme-settings',
  's-notif-prefs',
  's-edit-profile',
  's-security',
  's-about',
  's-delete-account',
] as const;
export type Page10 = (typeof PAGES10)[number];
export const isFlow10 = (p: string): p is Page10 => (PAGES10 as readonly string[]).includes(p);

const noop = () => {};
const label = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
};

const HIGHLIGHTS: CollectionPage = {
  items: 86,
  books: 9,
  next: null,
  counts: { bookmark: 12, highlight: 86, note: 12 },
  groups: [
    {
      // Ids chosen so the hashed cover tone matches the prototype (c1, c3).
      book_id: 'harmattan-3',
      title: 'Harmattan Letters',
      author: 'Ifeoma Nwachukwu',
      highlights: 6,
      notes: 2,
      owned: true,
      items: [
        {
          id: 'a1',
          kind: 'highlight',
          color: 'yellow',
          quote: 'Each one smelled faintly of camphor',
          note: null,
          cfi: '',
          chapter_ord: 6,
          shared_group_id: null,
          created_at: '2026-11-10T09:00:00Z',
        },
        {
          id: 'a2',
          kind: 'highlight',
          color: 'green',
          quote: 'I have asked God for a wife who laughs at my jokes even when they are bad.',
          note: 'This made me laugh out loud on the bus.',
          cfi: '',
          chapter_ord: 3,
          shared_group_id: 'g',
          shared_to: 'Grace Readers',
          created_at: '2026-11-08T09:00:00Z',
        },
      ],
    },
    {
      book_id: 'alignment-4',
      title: 'The Alignment',
      author: 'Adaeze Rosemary Possible',
      highlights: 11,
      notes: 0,
      owned: true,
      items: [
        {
          id: 'a3',
          kind: 'highlight',
          color: 'pink',
          quote: 'He had prayed for her by name.',
          note: null,
          cfi: '',
          chapter_ord: 13,
          shared_group_id: null,
          created_at: '2026-11-02T09:00:00Z',
        },
      ],
    },
  ],
};

const ACTIONS: SettingsActions = {
  onBack: noop,
  onEditProfile: noop,
  onNotifications: noop,
  onSecurity: noop,
  onPrivacy: noop,
  onPreferences: noop,
  onNavigation: noop,
  onReaderTheme: noop,
  onDownloads: noop,
  onCredits: noop,
  onSubscription: noop,
  onAppColour: noop,
  onInvite: noop,
  onAbout: noop,
  onLogOut: noop,
  onDelete: noop,
};

/** `.pb`: padding 4 18 28, gap 14 (the flat sheet body). */
function Pb({ children }: { children: React.ReactNode }) {
  const { s } = useTheme();
  return (
    <View style={{ paddingTop: s(4), paddingHorizontal: s(18), paddingBottom: s(28), gap: s(14) }}>
      {children}
    </View>
  );
}

export function Flow10({ page }: { page: Page10 }) {
  const { s } = useTheme();
  switch (page) {
    case 's-profile':
      return (
        <ProfileView
          name="Ngozi Eze"
          email="ngozi.eze@example.com"
          summary={{
            books_read: 14,
            following: 23,
            highlights: 86,
            bookmarks: 12,
            notes: 12,
            year: 2026,
            // a date on which 14 of 24 is on track
            today: '2026-07-01',
            read_this_year: 14,
            goal: 24,
            last_year: null,
            is_author: false,
          }}
          onSettings={noop}
          onGoal={noop}
          onCollection={noop}
          onAuthor={noop}
        />
      );
    case 's-goal':
      return (
        <Pb>
          <GoalBody current={24} read={14} onSave={noop} />
        </Pb>
      );
    case 's-my-highlights':
      return (
        <CollectionView
          kind="highlight"
          page={HIGHLIGHTS}
          searching={false}
          query=""
          dateLabel={label}
          onBack={noop}
          onKind={noop}
          onSearch={noop}
          onQuery={noop}
          onRetry={noop}
          onOpen={noop}
          onItemMenu={noop}
        />
      );
    case 's-account':
      return (
        <SettingsView
          d={{
            name: 'Ngozi Eze',
            email: 'ngozi.eze@example.com',
            blocked: 2,
            interests: 3,
            navigation: 'Swipe pages',
            readerTheme: 'light',
            downloads: '2 books · 4.8 MB · Wi-Fi only',
            credits: 840,
            subscription: { label: 'Active', tone: 'ok' },
            appColour: 'sunflower',
            version: '1.0.0',
          }}
          a={ACTIONS}
        />
      );
    case 's-theme-settings':
      return (
        <View style={{ paddingTop: s(16), paddingBottom: s(22) }}>
          <ThemeBody value="sunflower" onPick={noop} onDone={noop} />
        </View>
      );
    case 's-notif-prefs':
      return (
        <NotifPrefsView
          prefs={{
            clubs: true,
            authors: true,
            note_replies: true,
            reminders: false,
            offers: false,
            quiet_enabled: true,
            quiet_start: '22:00:00',
            quiet_end: '06:00:00',
          }}
          onBack={noop}
          onFeed={noop}
          onToggle={noop}
          onMessages={noop}
          onOpenSettings={noop}
        />
      );
    case 's-edit-profile':
      return (
        <>
          <EditProfileView
            values={{
              name: 'Ngozi Eze',
              bio: 'Choir alto. Reads on the BRT.',
              phone: '803 412 7781',
              dob: '14 / 03 / 1996',
              country: 'NG',
            }}
            errors={{}}
            countryName="Nigeria"
            callingCode="234"
            onBack={noop}
            onChange={noop}
            onBlur={noop}
            onPhoto={noop}
            onCountry={noop}
          />
          <EditProfileFoot canSave onSave={noop} />
        </>
      );
    case 's-security':
      return (
        <SecurityView
          d={{
            email: 'ngozi.eze@example.com',
            emailVerified: true,
            google: true,
            hasPassword: true,
            enabled: 2,
            devices: [
              {
                id: 'd1',
                model: 'Tecno Camon 30',
                city: 'Enugu',
                last_seen_at: '2026-11-19T08:00:00Z',
                current: true,
                download_enabled: true,
              },
              {
                id: 'd2',
                model: 'Samsung Galaxy A15',
                city: 'Lagos',
                last_seen_at: '2026-11-03T08:00:00Z',
                current: false,
                download_enabled: true,
              },
            ],
          }}
          dateLabel={label}
          onBack={noop}
          onVerify={noop}
          onGoogle={noop}
          onChangePassword={noop}
          onRemove={noop}
        />
      );
    case 's-about':
      return (
        <AboutView
          version="1.0.0"
          build="31"
          onBack={noop}
          onHelp={noop}
          onCopy={noop}
          onTerms={noop}
          onPrivacy={noop}
          onCopyright={noop}
        />
      );
    case 's-delete-account':
      return (
        <>
          <DeleteAccountView
            facts={{ credits: 840, finished: 14, highlights: 86, storePlan: 'Quarterly' }}
            text="DELE"
            onText={noop}
            onBack={noop}
            onOpenPlay={noop}
          />
          <DeleteAccountFoot text="DELE" onDelete={noop} onKeep={noop} />
        </>
      );
  }
}
