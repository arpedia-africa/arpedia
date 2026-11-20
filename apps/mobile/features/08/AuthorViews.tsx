import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  Avatar,
  Btn,
  Card,
  Cell,
  Cover,
  Hero,
  Icon,
  IconButton,
  Pill,
  Press,
  Skeleton,
  Tabs,
  Text,
  rgba,
  useTheme,
  type AvatarTone,
  type CoverTone,
} from '@arpedia/ui';

// s-author. Pure views for app/(authors)/author/[id].tsx
// (`node tools/screen.mjs s-author --css`).

export type AuthorTab = 'posts' | 'books' | 'about';

export interface PostCardView {
  id: string;
  time: string;
  title: string;
  excerpt: string;
  likes: string;
  comments: string;
}

export interface BookRowView {
  id: string;
  title: string;
  /** "4.7★ · 125 credits" */
  sub: string;
  tone: CoverTone;
}

export interface AuthorModel {
  name: string;
  avatarUrl: string | null;
  tone: AvatarTone;
  /** "3 books · 12 posts · Enugu, Nigeria" */
  meta: string;
  bio: string | null;
  isMe: boolean;
  following: boolean;
  /** "Message · 5 cr" */
  messageLabel: string;
  /** Message and Tip are hidden (the viewer blocked the author, rule 9). */
  blockedByMe: boolean;
  /** The author's account is gone (edge cases). */
  gone: boolean;
  community: { name: string; sub: string; joined: boolean } | null;
  stats: { followers: string; readers: string; rating: string };
  postCount: number;
  bookCount: number;
  about: { bio: string | null; rows: { k: string; v: string }[] };
}

export interface AuthorActions {
  onBack: () => void;
  onShare?: () => void;
  onFollow?: () => void;
  onMessage?: () => void;
  onTip?: () => void;
  onEditProfile?: () => void;
  onCommunity?: () => void;
  onUnblock?: () => void;
  onPost: (id: string) => void;
  onBook: (id: string) => void;
  onMorePosts?: () => void;
  /** Follow, Message and Tip off (offline). */
  actionsOff?: boolean;
}

/** `.av.xl.ring-night`: 4px main-colour ring, then 2px night, drawn outside the avatar. */
function RingAvatar({ name, uri, tone }: { name: string; uri: string | null; tone: AvatarTone }) {
  const { c, s } = useTheme();
  return (
    <View style={{ margin: -s(6), padding: s(2), borderRadius: 999, backgroundColor: c.night }}>
      <View style={{ padding: s(4), borderRadius: 999, backgroundColor: c.org }}>
        <Avatar name={name} uri={uri ?? undefined} tone={tone} size="xl" />
      </View>
    </View>
  );
}

/** `.hero__sub` bio: 4 lines, "more" expands (rule 1). */
function Bio({ text }: { text: string }) {
  const { c, s } = useTheme();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState(0);
  const style = { lineHeight: s(14.5) * 1.45, maxWidth: s(292.7) };
  return (
    <View>
      {/* Unclamped copy, measured off screen, to know whether "more" is needed. */}
      <Text
        size={14.5}
        color="onOrg"
        style={[style, { position: 'absolute', opacity: 0 }]}
        onTextLayout={(e) => setLines(e.nativeEvent.lines.length)}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {text}
      </Text>
      <Text size={14.5} color="onOrg" numberOfLines={open ? undefined : 4} style={style}>
        {text}
      </Text>
      {lines > 4 && !open ? (
        <Press
          onPress={() => setOpen(true)}
          hitSlop={12}
          accessibilityRole="button"
          style={{ alignSelf: 'flex-start' }}
        >
          <Text
            size={14.5}
            weight={700}
            color="onOrg"
            style={{ lineHeight: s(14.5) * 1.45, textDecorationColor: c.onOrg }}
          >
            more
          </Text>
        </Press>
      ) : null}
    </View>
  );
}

/** `.hero-person` + `.hero__body.pt16` inside the band. */
function Head({ m, a }: { m: AuthorModel; a: AuthorActions }) {
  const { c, s } = useTheme();
  return (
    <Hero
      barBack
      bar={
        <>
          <IconButton icon="back" label="Back" onPress={a.onBack} color={c.onOrg} />
          <View style={{ flex: 1 }} />
          {a.onShare ? <IconButton icon="share" label="Share" onPress={a.onShare} color={c.onOrg} /> : null}
        </>
      }
      bodyStyle={{ paddingTop: 0, paddingHorizontal: 0, gap: 0 }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: s(14),
          paddingTop: s(4),
          paddingHorizontal: s(16),
        }}
      >
        <RingAvatar name={m.name} uri={m.avatarUrl} tone={m.tone} />
        <View style={{ flex: 1, minWidth: 0, gap: s(4) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
            <Pill label="Arpedia author" tone="night" />
          </View>
          <Text
            variant="h1"
            color="onOrg"
            accessibilityRole="header"
            textBreakStrategy="balanced"
            numberOfLines={2}
            ellipsis
          >
            {m.name}
          </Text>
          <Text size={12.5} weight={600} color={rgba(c.onOrgRgb, 0.75)} oneLine>
            {m.meta}
          </Text>
        </View>
      </View>
      {m.bio ? (
        <View style={{ paddingTop: s(16), paddingHorizontal: s(16), gap: s(12) }}>
          <Bio text={m.bio} />
        </View>
      ) : null}
    </Hero>
  );
}

/** `.au-actions`: Following / Message · 5 cr / Tip (grid 1fr 1fr auto, gap 8). */
function Actions({ m, a }: { m: AuthorModel; a: AuthorActions }) {
  const { s } = useTheme();
  if (m.gone) return null;
  if (m.isMe) {
    return (
      <View style={{ paddingTop: s(16), paddingHorizontal: s(16) }}>
        <Btn label="Edit profile" variant="s" size="md" block icon="pen" onPress={a.onEditProfile} />
      </View>
    );
  }
  if (m.blockedByMe) {
    return (
      <View style={{ paddingTop: s(16), paddingHorizontal: s(16), gap: s(8) }}>
        <Text size={13.5} color="ink2" oneLine>
          You blocked this author
        </Text>
        <Btn label="Unblock" variant="s" size="md" block onPress={a.onUnblock} disabled={a.actionsOff} />
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', gap: s(8), paddingTop: s(16), paddingHorizontal: s(16) }}>
      <Btn
        label={m.following ? 'Following' : 'Follow'}
        variant={m.following ? 'n' : 'p'}
        size="md"
        icon={m.following ? 'check' : 'plus'}
        onPress={a.onFollow}
        disabled={a.actionsOff}
        style={{ flex: 1, paddingHorizontal: s(10) }}
      />
      <Btn
        label={m.messageLabel}
        variant="s"
        size="md"
        icon="chat"
        onPress={a.onMessage}
        disabled={a.actionsOff || !a.onMessage}
        style={{ flex: 1, paddingHorizontal: s(10) }}
      />
      {a.onTip ? (
        // .btn-s.md with only the coin icon (padding 0 18)
        <TipButton onPress={a.onTip} off={!!a.actionsOff} />
      ) : null}
    </View>
  );
}

/** `a.btn.btn-s.md` holding only the coin icon: 42 high, padding 0 18, radius 12. */
function TipButton({ onPress, off }: { onPress: () => void; off: boolean }) {
  const { c, s } = useTheme();
  return (
    <Press
      onPress={off ? undefined : onPress}
      disabled={off}
      pressScale={0.97}
      accessibilityRole="button"
      accessibilityLabel="Tip the author"
      accessibilityState={{ disabled: off }}
      style={{
        minHeight: s(42),
        paddingHorizontal: s(18),
        borderRadius: s(12),
        backgroundColor: off ? c.surface : c.orgTint,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="coin" size="s" color={off ? c.ink3 : c.orgInk} />
    </Press>
  );
}

/** `.stat`: grey tile, value 20/800 display, label 12 ink-2. */
function Stat({ value, label }: { value: string; label: string }) {
  const { c, s } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: s(14), padding: s(12) }}>
      <Text family="display" size={20} weight={800} tabular oneLine style={{ lineHeight: s(20) * 1.1 }}>
        {value}
      </Text>
      <Text size={12} color="ink2" oneLine>
        {label}
      </Text>
    </View>
  );
}

/** `.post.au-post`: time, title, two-line excerpt, likes and comments. */
export function PostCard({ p, onPress }: { p: PostCardView; onPress: () => void }) {
  const { c, s, bw } = useTheme();
  return (
    <Press
      onPress={onPress}
      pressScale={0.99}
      accessibilityRole="link"
      accessibilityLabel={`${p.title}, ${p.time}`}
      style={{
        marginTop: s(12),
        marginHorizontal: s(16),
        padding: s(16),
        gap: s(8),
        borderWidth: bw(1),
        borderColor: c.line,
        borderRadius: s(16),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
        <Icon name="clock" size="xs" color={c.ink3} />
        <Text variant="xs" color="ink3" oneLine>
          {p.time}
        </Text>
      </View>
      <Text variant="h3" ellipsis numberOfLines={2}>
        {p.title}
      </Text>
      <Text variant="sm" color="ink2" numberOfLines={2}>
        {p.excerpt}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(14) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(4) }}>
          <Icon name="heart" size="xs" color={c.ink3} />
          <Text size={12.5} color="ink3" tabular oneLine>
            {p.likes}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(4) }}>
          <Icon name="chat" size="xs" color={c.ink3} />
          <Text size={12.5} color="ink3" tabular oneLine>
            {p.comments}
          </Text>
        </View>
      </View>
    </Press>
  );
}

function Empty({ children }: { children: string }) {
  const { s } = useTheme();
  return (
    <Text size={13.5} color="ink2" center style={{ paddingVertical: s(32), paddingHorizontal: s(24) }}>
      {children}
    </Text>
  );
}

export function AuthorView({
  m,
  a,
  tab,
  onTab,
  posts,
  books,
  notice,
}: {
  m: AuthorModel;
  a: AuthorActions;
  tab: AuthorTab;
  onTab: (t: AuthorTab) => void;
  /** null while loading. */
  posts: PostCardView[] | null;
  books: BookRowView[] | null;
  notice?: ReactNode;
}) {
  const { s } = useTheme();
  const first = m.name.split(' ')[0];
  return (
    <View style={{ paddingBottom: s(28) }}>
      <Head m={m} a={a} />
      {notice}
      <Actions m={m} a={a} />
      {m.community ? (
        <Card pad={false} style={{ marginTop: s(16), marginHorizontal: s(16) }}>
          <Cell
            title={m.community.name}
            sub={m.community.sub}
            ugc
            onPress={a.onCommunity}
            trail={<Btn label={m.community.joined ? 'Open' : 'Join'} size="sm" onPress={a.onCommunity} />}
          />
        </Card>
      ) : null}
      <View style={{ flexDirection: 'row', gap: s(8), paddingTop: s(16), paddingHorizontal: s(16) }}>
        <Stat value={m.stats.followers} label="followers" />
        <Stat value={m.stats.readers} label="readers" />
        <Stat value={m.stats.rating} label="avg rating" />
      </View>
      <View style={{ paddingTop: s(24) }}>
        <Tabs
          tabs={[
            { key: 'posts', label: m.blockedByMe ? 'Posts' : `Posts ${m.postCount}` },
            { key: 'books', label: `Books ${m.bookCount}` },
            { key: 'about', label: 'About' },
          ]}
          active={tab}
          onChange={(k) => onTab(k as AuthorTab)}
        />
      </View>
      {tab === 'posts' ? (
        m.blockedByMe ? (
          <Empty>Posts are hidden while you block this author.</Empty>
        ) : posts == null ? (
          <PostSkeletons />
        ) : posts.length === 0 ? (
          <Empty>{`No posts yet. ${first} hasn’t posted.`}</Empty>
        ) : (
          <>
            {posts.map((p) => (
              <PostCard key={p.id} p={p} onPress={() => a.onPost(p.id)} />
            ))}
            {a.onMorePosts ? (
              <View style={{ paddingTop: s(12), paddingHorizontal: s(16) }}>
                <Btn label="Load more" variant="g" size="md" block onPress={a.onMorePosts} />
              </View>
            ) : null}
          </>
        )
      ) : tab === 'books' ? (
        books == null ? (
          <PostSkeletons />
        ) : books.length === 0 ? (
          <Empty>No books published yet.</Empty>
        ) : (
          <View style={{ paddingTop: s(4) }}>
            {books.map((b) => (
              <Cell
                key={b.id}
                flush
                ugc
                title={b.title}
                sub={b.sub}
                lead={<Cover title={b.title} author={m.name} size={40} tone={b.tone} />}
                chevron
                onPress={() => a.onBook(b.id)}
              />
            ))}
          </View>
        )
      ) : (
        <View style={{ paddingTop: s(16), paddingHorizontal: s(16), gap: s(16) }}>
          {m.about.bio ? (
            <Text variant="body" color="ink2">
              {m.about.bio}
            </Text>
          ) : null}
          <View>
            {m.about.rows.map((r) => (
              <View
                key={r.k}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  gap: s(12),
                  paddingVertical: s(10),
                }}
              >
                <Text size={14} color="ink2" oneLine>
                  {r.k}
                </Text>
                <Text
                  size={14}
                  weight={600}
                  ellipsis
                  numberOfLines={1}
                  style={{ flexShrink: 1, textAlign: 'right' }}
                >
                  {r.v}
                </Text>
              </View>
            ))}
          </View>
          {m.community ? (
            <Btn label={`Open ${m.community.name}`} variant="s" size="md" block onPress={a.onCommunity} />
          ) : null}
        </View>
      )}
    </View>
  );
}

function PostSkeletons() {
  const { s } = useTheme();
  return (
    <View style={{ paddingHorizontal: s(16), paddingTop: s(12), gap: s(12) }}>
      {[0, 1].map((i) => (
        <Skeleton key={i} height={128} radius={16} />
      ))}
    </View>
  );
}

/** Loading: the band with the back button, skeleton person and rows; stats show dashes. */
export function AuthorSkeleton({ onBack }: { onBack: () => void }) {
  const { c, s } = useTheme();
  return (
    <View>
      <Hero barBack bar={<IconButton icon="back" label="Back" onPress={onBack} color={c.onOrg} />}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: s(14), paddingTop: s(4) }}>
          <View
            style={{
              width: s(88),
              height: s(88),
              borderRadius: 999,
              backgroundColor: rgba(c.onOrgRgb, 0.14),
            }}
          />
          <View style={{ flex: 1, gap: s(8) }}>
            <View
              style={{
                width: '50%',
                height: s(20),
                borderRadius: 999,
                backgroundColor: rgba(c.onOrgRgb, 0.14),
              }}
            />
            <View
              style={{
                width: '85%',
                height: s(28),
                borderRadius: s(8),
                backgroundColor: rgba(c.onOrgRgb, 0.14),
              }}
            />
          </View>
        </View>
      </Hero>
      <View style={{ flexDirection: 'row', gap: s(8), paddingTop: s(16), paddingHorizontal: s(16) }}>
        <Skeleton height={42} radius={12} style={{ flex: 1 }} />
        <Skeleton height={42} radius={12} style={{ flex: 1 }} />
      </View>
      <View style={{ flexDirection: 'row', gap: s(8), paddingTop: s(16), paddingHorizontal: s(16) }}>
        <Stat value="–" label="followers" />
        <Stat value="–" label="readers" />
        <Stat value="–" label="avg rating" />
      </View>
      <View style={{ paddingTop: s(24) }}>
        <PostSkeletons />
      </View>
    </View>
  );
}
