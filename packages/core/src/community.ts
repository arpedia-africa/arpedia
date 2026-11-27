// Flow 06 · Community: chat protocol between the app and the conversation Durable Object, and the
// small formatting rules the inbox and chat share (times, unread caps, member counts, composer copy).

export const MESSAGE_MAX = 2000;
export const QUOTE_MAX = 300;
export const DETAILS_MAX = 500;
/** Q75: six fixed reactions (thumbs up, heart, laugh, wow, sad, fire). */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'] as const;
export type Reaction = (typeof REACTIONS)[number];
/** Messages queued offline (rule: up to 5, sent in order on reconnect). */
export const OFFLINE_QUEUE_MAX = 5;

export type GroupKind = 'official' | 'club' | 'author' | 'readalong' | 'room' | 'dm';

export type PostBlock =
  | 'not_member'
  | 'banned'
  | 'archived'
  | 'muted'
  | 'locked'
  | 'channel_muted'
  | 'staff_only'
  | 'owner_only'
  | 'blocked';

export type SendError =
  | PostBlock
  | 'slow_mode'
  | 'rejected_by_rules'
  | 'phone_number'
  | 'rate_limited'
  | 'too_long'
  | 'empty'
  | 'quote_not_allowed';

export interface QuotePayload {
  book_id: string;
  chapter: number;
  cfi: string;
  text: string;
  book_title?: string;
  chapter_title?: string;
}

/** A message as the chat shows it (history from get_messages, live from the socket). */
export interface ChatMessage {
  id: string;
  group_id: string;
  sender_id: string | null;
  sender_name: string;
  sender_avatar: string | null;
  sender_is_author: boolean;
  kind: 'text' | 'quote' | 'system';
  body: string | null;
  quote: QuotePayload | null;
  reply_to_id: string | null;
  reply_to: { id: string; sender_name: string; state: string; body: string | null } | null;
  state: 'visible' | 'auto_hidden' | 'removed' | 'deleted';
  created_at: string;
  reactions: Partial<Record<Reaction, number>>;
  my_reaction: Reaction | null;
  pinned: boolean;
}

// ─── Socket protocol ────────────────────────────────────────────────────────
export type ClientFrame =
  | {
      type: 'send';
      client_id: string;
      body: string;
      reply_to_id?: string | null;
      quote?: QuotePayload | null;
    }
  | { type: 'ping' };

export type ServerFrame =
  | {
      type: 'hello';
      reading_now: number;
      post_block: PostBlock | null;
      post_block_until: string | null;
      slow_mode_seconds: number;
      read_only: boolean;
    }
  | { type: 'pong' }
  | { type: 'ack'; client_id: string; id: string; created_at: string }
  | { type: 'error'; client_id?: string; error: SendError; wait_seconds?: number; until?: string | null }
  | { type: 'message'; message: ChatMessage; client_id?: string }
  | { type: 'state'; message_id: string; state: ChatMessage['state'] }
  | { type: 'reactions'; message_id: string; reactions: ChatMessage['reactions'] }
  | { type: 'pins'; pins: string[] }
  | { type: 'presence'; reading_now: number }
  | {
      type: 'group';
      post_block: PostBlock | null;
      post_block_until: string | null;
      slow_mode_seconds: number;
    };

// ─── Inbox socket (per-user InboxDO, `GET /inbox`) ──────────────────────────
/** Most conversations one inbox socket can watch (the inbox loads at most 100 rows). */
export const INBOX_WATCH_MAX = 100;

export type InboxClientFrame =
  /** The conversations on screen; replaces the previous list. Resend every few minutes. */
  { type: 'watch'; groups: string[] } | { type: 'ping' };

export type InboxServerFrame =
  | { type: 'pong' }
  /** Someone else posted in a watched conversation: refetch the inbox rows and counts. */
  | { type: 'activity'; group_id: string; at: string }
  /** "Reading now" changed in a watched conversation (0 for very large groups). */
  | { type: 'reading_now'; group_id: string; reading_now: number };

/** Socket close code when the user may no longer be in the conversation. */
export const CLOSE_FORBIDDEN = 4403;

// ─── Formatting ─────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Inbox times: now, 45m, 1h, 3h, 4d, then "10 Nov" (a week or more). */
export function inboxTime(at: Date | string, now: Date = new Date()): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Row unread number: 99 and over shows "99+". */
export function unreadLabel(n: number): string {
  return n > 99 ? '99+' : String(n);
}

/** Community tab badge: conversations with unread, over 9 shows "9+". */
export function tabBadgeLabel(n: number): string {
  return n > 9 ? '9+' : String(n);
}

/** Member counts: 1,240 below 10,000; 12.4k from 10,000; 1.2M from a million. */
export function memberCount(n: number): string {
  if (n < 10_000) return n.toLocaleString('en-US');
  if (n < 1_000_000) return `${trim1(n / 1000)}k`;
  return `${trim1(n / 1_000_000)}M`;
}

function trim1(v: number): string {
  const s = (Math.floor(v * 10) / 10).toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** Chat day markers: Today, Yesterday, then "Mon 9 Nov". */
export function dayLabel(at: Date | string, now: Date = new Date()): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Chat times: 24-hour HH:mm in the device time zone. */
export function chatTime(at: Date | string): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "19 Nov" for mutes and locks more than a day away, otherwise "15:00". */
function untilLabel(until: string | null | undefined, now: Date): string {
  if (!until) return '';
  const d = new Date(until);
  if (d.getTime() - now.getTime() > 86_400_000) return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return chatTime(d);
}

/** Who may post in a staff-only channel, for the composer sentence. */
export function postBlockCopy(
  block: PostBlock | 'slow_mode',
  opts: { until?: string | null; waitSeconds?: number; now?: Date } = {},
): string {
  const now = opts.now ?? new Date();
  switch (block) {
    case 'staff_only':
      return 'Only Arpedia Team can post here. You can still react.';
    case 'owner_only':
      return 'Only the author and moderators can post here. You can still react.';
    case 'locked':
      return 'Chat is locked by moderators.';
    case 'channel_muted':
      return `Moderators muted this channel until ${untilLabel(opts.until, now)}.`;
    case 'muted':
      return opts.until && new Date(opts.until).getFullYear() < 9000
        ? `You are muted until ${untilLabel(opts.until, now)}.`
        : 'You are muted in this group.';
    case 'slow_mode':
      return `Wait ${Math.max(1, Math.ceil(opts.waitSeconds ?? 1))} s before your next message.`;
    case 'not_member':
      return 'Join this community to post.';
    case 'blocked':
      return "You can't message this person.";
    case 'banned':
    case 'archived':
      return 'This conversation is closed.';
  }
}

/** Copy for a failed send (rule: spam rules, phone numbers). */
export function sendErrorCopy(e: SendError): string {
  switch (e) {
    case 'rejected_by_rules':
      return "Your message wasn't sent because it breaks our rules";
    case 'phone_number':
      return 'Please remove the phone number';
    case 'rate_limited':
      return "You're sending messages too fast. Try again in a moment.";
    case 'too_long':
      return `Messages can be up to ${MESSAGE_MAX.toLocaleString('en-US')} characters.`;
    case 'quote_not_allowed':
      return 'You can only share highlights from books you can read.';
    case 'empty':
      return 'Write a message first.';
    default:
      return postBlockCopy(e);
  }
}

/** Groups filter subtitle: "Club · 1,240 members". */
export function groupTypeLabel(kind: GroupKind): string {
  switch (kind) {
    case 'club':
      return 'Club';
    case 'author':
      return 'Author community';
    case 'official':
      return 'Official';
    case 'readalong':
      return 'Read-along';
    case 'room':
      return 'Reading room';
    case 'dm':
      return 'Message';
  }
}

/** Discover subtitle type: "Group · public · 1,240 members". */
export function discoverTypeLabel(kind: GroupKind): string {
  switch (kind) {
    case 'club':
      return 'Group';
    case 'author':
      return 'Author';
    case 'readalong':
      return 'Read-along';
    default:
      return groupTypeLabel(kind);
  }
}

/** Two-letter initials for avatars without a photo. */
export function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/**
 * Time-ordered uuid (v7): 48-bit Unix ms, version 7, variant 10, then random bits.
 * Hermes has no global `crypto`, so the app passes expo-crypto's `getRandomBytes`.
 */
export function uuid7(
  ms: number = Date.now(),
  random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  const b = random(16);
  let t = ms;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
