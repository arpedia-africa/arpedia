import { ScrollView, TextInput, View } from 'react-native';
import {
  Avatar,
  Btn,
  Chip,
  Hero,
  Icon,
  IconButton,
  Press,
  Text,
  fontFamily,
  motion,
  useTheme,
  type AvatarTone,
} from '@arpedia/ui';

// Flow 06 Discover pieces that mirror prototype elements one to one
// (`node tools/screen.mjs s-discover --css`).

export type DiscoverType = 'all' | 'groups' | 'authors' | 'readalongs' | 'official';
export const DISCOVER_TYPES: { key: DiscoverType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'groups', label: 'Groups' },
  { key: 'authors', label: 'Authors' },
  { key: 'readalongs', label: 'Read-alongs' },
  { key: 'official', label: 'Official' },
];

/** `.search` on the hero: white, radius 12, 48 tall, search icon and 14px ink-3 text. */
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const { c, s } = useTheme();
  const family = fontFamily('ui', 400);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(10),
        backgroundColor: c.white,
        borderRadius: s(12),
        minHeight: s(48),
        paddingHorizontal: s(14),
      }}
    >
      <Icon name="search" size="s" color={c.ink3} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.ink3}
        selectionColor={c.org}
        cursorColor={c.org}
        returnKeyType="search"
        accessibilityLabel={placeholder}
        style={{
          flex: 1,
          minWidth: 0,
          paddingVertical: 0,
          paddingHorizontal: 0,
          includeFontPadding: false,
          fontFamily: family,
          fontSize: s(14),
          color: c.ink,
        }}
      />
    </View>
  );
}

/** `.hero` with back, "Discover communities" and the search box. */
export function DiscoverHero({
  query,
  onQuery,
  onBack,
}: {
  query: string;
  onQuery: (q: string) => void;
  onBack: () => void;
}) {
  const { c } = useTheme();
  return (
    <Hero
      barBack
      bar={<IconButton icon="back" label="Back" onPress={onBack} color={c.onOrg} />}
      title="Discover communities"
      titleOneLine
    >
      <SearchBox value={query} onChange={onQuery} placeholder="Search communities" />
    </Hero>
  );
}

/** `.chips.pt16` (single choice): All, Groups, Authors, Read-alongs, Official. */
export function TypeChips({ value, onChange }: { value: DiscoverType; onChange: (t: DiscoverType) => void }) {
  const { s } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ paddingTop: s(16), flexGrow: 0 }}
      contentContainerStyle={{ gap: s(8), paddingHorizontal: s(16) }}
    >
      {DISCOVER_TYPES.map((t) => (
        <Chip
          key={t.key}
          label={t.label}
          state={t.key === value ? 'on' : 'off'}
          onPress={() => onChange(t.key)}
        />
      ))}
    </ScrollView>
  );
}

export interface DiscoverRowView {
  id: string;
  name: string;
  tone: AvatarTone;
  avatarUrl?: string | null;
  /** "Group · public · 1,240 members · live now" */
  type: string;
  description: string;
  joined: boolean;
}

/** `.cell.cell--tap.cell--top`: avatar, title, `.com-type`, two-line sub, Join or Joined. */
export function DiscoverRow({
  row,
  divider,
  busy,
  onOpen,
  onJoin,
}: {
  row: DiscoverRowView;
  divider: boolean;
  busy?: boolean;
  onOpen: () => void;
  onJoin: () => void;
}) {
  const { c, s, bw } = useTheme();
  return (
    <Press
      onPress={onOpen}
      pressScale={motion.press.row}
      accessibilityLabel={`${row.name}, ${row.type}`}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: s(12),
        paddingVertical: s(12),
        paddingHorizontal: s(16),
        minHeight: s(56),
        ...(divider ? { borderTopWidth: bw(1), borderTopColor: c.line } : null),
      }}
    >
      <Avatar name={row.name} uri={row.avatarUrl ?? undefined} tone={row.tone} square />
      <View style={{ flex: 1, minWidth: 0, gap: s(2) }}>
        <Text size={14.5} weight={600} ellipsis style={{ lineHeight: s(14.5) * 1.3 }}>
          {row.name}
        </Text>
        <Text size={12} color="ink3" style={{ lineHeight: s(12) * 1.45 }}>
          {row.type}
        </Text>
        {row.description ? (
          <Text size={12.5} color="ink3" numberOfLines={2} style={{ lineHeight: s(12.5) * 1.35 }}>
            {row.description}
          </Text>
        ) : null}
      </View>
      {row.joined ? (
        <Btn label="Joined" variant="g" size="sm" icon="check" />
      ) : (
        <Btn label="Join" size="sm" loading={busy} onPress={onJoin} />
      )}
    </Press>
  );
}
