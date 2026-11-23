import { forwardRef, type ComponentRef } from 'react';
import { TextInput, View } from 'react-native';
import {
  Avatar,
  Btn,
  Icon,
  IconButton,
  OnHero,
  Petals,
  Press,
  Skeleton,
  Text,
  fontFamily,
  rgba,
  useTheme,
  type AvatarTone,
} from '@arpedia/ui';
import { AuthorBadge } from '../06/InboxViews';

// s-post. Pure views for app/(authors)/post/[id].tsx (`node tools/screen.mjs s-post --css`).

export interface CommentView {
  id: string;
  name: string;
  avatarUrl: string | null;
  tone: AvatarTone;
  time: string;
  isAuthor: boolean;
  /** Body, or the replacement line ("Comment removed by author", …) in muted text. */
  text: string;
  muted: boolean;
  /** "This content is under review" (rule 15), shown to the author and the commenter. */
  review: boolean;
  /** "Not sent. Tap to retry" / "Sending…" */
  status: string | null;
  canReply: boolean;
  canMenu: boolean;
  reply: boolean;
}

/** `.com-head` for a post: back, round author avatar, "Discussion" and "Name · time", share. */
export function PostHead({
  name,
  tone,
  avatarUrl,
  status,
  onBack,
  onShare,
}: {
  name: string;
  tone: AvatarTone;
  avatarUrl?: string | null;
  status: string;
  onBack: () => void;
  onShare?: () => void;
}) {
  const { c, s } = useTheme();
  return (
    <OnHero.Provider value>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: s(6),
          paddingTop: s(4),
          paddingHorizontal: s(6),
          paddingBottom: s(12),
          backgroundColor: c.org,
          overflow: 'hidden',
        }}
      >
        <Petals size={s(220)} opacity={0.5} style={{ right: s(-90), top: s(-150) }} />
        <IconButton icon="back" label="Back" onPress={onBack} color={c.onOrg} />
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
          <View
            style={{
              margin: -s(2),
              padding: s(2),
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.9)',
            }}
          >
            <Avatar name={name} uri={avatarUrl ?? undefined} tone={tone} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text size={15.5} weight={800} color="onOrg" oneLine accessibilityRole="header">
              Discussion
            </Text>
            <Text size={12} color={rgba(c.onOrgRgb, 0.72)} ellipsis>
              {status}
            </Text>
          </View>
        </View>
        {onShare ? <IconButton icon="share" label="Share" onPress={onShare} color={c.onOrg} /> : null}
      </View>
    </OnHero.Provider>
  );
}

/** `.inset.v12.pt16.pb16`: title, body, likes and comments buttons (`.au-like`). */
export function PostBody({
  title,
  body,
  likes,
  comments,
  liked,
  onLike,
  onComments,
  likeOff,
}: {
  title: string;
  body: string;
  likes: string;
  comments: string;
  liked: boolean;
  onLike: () => void;
  onComments: () => void;
  likeOff?: boolean;
}) {
  const { s, name } = useTheme();
  return (
    <View style={{ paddingHorizontal: s(16), paddingVertical: s(16), gap: s(12) }}>
      <Text variant="h2" accessibilityRole="header" textBreakStrategy="balanced">
        {title}
      </Text>
      <Text
        variant="reading" // .t-reading hard-codes #2a2622; the night theme keeps its ink
        color={name === 'night' ? 'ink' : '#2a2622'}
        selectable
      >
        {body}
      </Text>
      <View style={{ flexDirection: 'row', gap: s(8) }}>
        <Btn
          label={likes}
          variant={liked ? 'p' : 's'}
          size="sm"
          icon="heart"
          onPress={onLike}
          disabled={likeOff}
          accessibilityHint={liked ? 'Remove your like' : 'Like this post'}
        />
        <Btn label={comments} variant="s" size="sm" icon="chat" onPress={onComments} />
      </View>
    </View>
  );
}

/** `.au-box`: the comment field with the round send button. */
export const CommentBox = forwardRef<
  ComponentRef<typeof TextInput>,
  {
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    sendOff: boolean;
    placeholder: string;
    editable: boolean;
  }
>(function CommentBox({ value, onChange, onSend, sendOff, placeholder, editable }, ref) {
  const { c, s, bw } = useTheme();
  return (
    <View
      style={{
        marginTop: s(4),
        marginHorizontal: s(16),
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: s(8),
        borderWidth: bw(1),
        borderColor: c.line,
        borderRadius: s(16),
        paddingVertical: s(10),
        paddingRight: s(10),
        paddingLeft: s(14),
      }}
    >
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.ink3}
        multiline
        maxLength={1000}
        editable={editable}
        accessibilityLabel="Comment"
        style={{
          flex: 1,
          minHeight: s(44),
          maxHeight: s(140),
          fontSize: s(14),
          fontFamily: fontFamily('ui', 400),
          color: c.ink,
          paddingVertical: s(4),
          textAlignVertical: 'top',
        }}
      />
      <Press
        onPress={sendOff ? undefined : onSend}
        disabled={sendOff}
        pressScale={0.9}
        accessibilityRole="button"
        accessibilityLabel="Post comment"
        accessibilityState={{ disabled: sendOff }}
        style={{
          width: s(44),
          height: s(44),
          borderRadius: 999,
          backgroundColor: sendOff ? c.surface : c.org,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="send" color={sendOff ? c.ink3 : c.onOrg} />
      </Press>
    </View>
  );
});

/** `.section__head.pt24`: "Comments" and "38 total". `.section__head` comes later in the CSS and resets the top padding to 0. */
export function CommentsHead({ total }: { total: string }) {
  const { s } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: s(12),
        paddingHorizontal: s(16),
        paddingBottom: s(12),
      }}
    >
      <Text variant="h3" oneLine style={{ lineHeight: s(18) * 1.45 }}>
        Comments
      </Text>
      <Text variant="sm" weight={700} color="orgInk" oneLine>
        {total}
      </Text>
    </View>
  );
}


/** `.au-comment`: avatar, name (+ Author badge), time, more, text, Reply. Replies sit one step in. */
export function CommentItem({
  v,
  onReply,
  onMenu,
  onRetry,
}: {
  v: CommentView;
  onReply?: () => void;
  onMenu?: () => void;
  onRetry?: () => void;
}) {
  const { c, s, bw } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: s(10),
        paddingVertical: s(14),
        paddingRight: s(16),
        // replies are indented by one avatar and gap (26 + 10)
        paddingLeft: s(v.reply ? 52 : 16),
        borderTopWidth: bw(1),
        borderTopColor: c.line,
      }}
    >
      <Avatar name={v.name} uri={v.avatarUrl ?? undefined} tone={v.tone} size="sm" />
      <View style={{ flex: 1, minWidth: 0, gap: s(3) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          <Text variant="title" ellipsis numberOfLines={1} style={{ flexShrink: 1 }}>
            {v.name}
          </Text>
          {v.isAuthor ? <AuthorBadge /> : null}
          <Text variant="xs" color="ink3" oneLine>
            {v.time}
          </Text>
          <View style={{ flex: 1 }} />
          {v.canMenu && onMenu ? (
            <IconButton
              icon="more"
              label={v.isAuthor ? 'More options' : 'Report or block'}
              onPress={onMenu}
              color={c.ink3}
              style={{ width: s(32), height: s(32), marginVertical: -s(6), marginRight: -s(8) }}
            />
          ) : null}
        </View>
        <Text
          size={14}
          color={v.muted ? 'ink3' : 'ink'}
          italic={v.muted}
          style={{ lineHeight: s(14) * 1.45 }}
        >
          {v.text}
        </Text>
        {v.review ? (
          <Text variant="xs" color="warn" oneLine>
            This content is under review
          </Text>
        ) : null}
        {v.status ? (
          <Press onPress={onRetry} disabled={!onRetry} accessibilityRole="button" hitSlop={8} pressScale={1}>
            <Text variant="xs" color={onRetry ? 'err' : 'ink3'} oneLine>
              {v.status}
            </Text>
          </Press>
        ) : v.canReply && onReply ? (
          <Press
            onPress={onReply}
            accessibilityRole="button"
            accessibilityLabel={`Reply to ${v.name}`}
            hitSlop={12}
            pressScale={1}
            style={{ alignSelf: 'flex-start' }}
          >
            <Text variant="xs" color="ink3" oneLine>
              Reply
            </Text>
          </Press>
        ) : null}
      </View>
    </View>
  );
}

export function PostSkeleton() {
  const { s } = useTheme();
  return (
    <View style={{ padding: s(16), gap: s(12) }}>
      <Skeleton height={26} width="80%" />
      <Skeleton height={16} />
      <Skeleton height={16} />
      <Skeleton height={16} width="60%" />
      <View style={{ flexDirection: 'row', gap: s(8) }}>
        <Skeleton height={36} width={96} radius={10} />
        <Skeleton height={36} width={120} radius={10} />
      </View>
    </View>
  );
}
