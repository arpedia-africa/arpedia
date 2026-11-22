// Flow 07 · Reading rooms: join codes, pace finish dates, spoiler checks and the small copy rules
// the rooms list and room screens share.

export const ROOM_NAME_MIN = 3;
export const ROOM_NAME_MAX = 40;
export const ROOM_CODE_LENGTH = 8;
/** Generated codes never use 0 O 1 I (the server's alphabet). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOMS_HOSTED_MAX = 5;

export type RoomPace = 'free' | 'three_week' | 'one_day';
export type RoomJoinPolicy = 'code' | 'anyone';
export type RoomState = 'scheduled' | 'live' | 'ended';
export type JoinStatus =
  | 'confirm'
  | 'joined'
  | 'member'
  | 'not_found'
  | 'ended'
  | 'full'
  | 'room_limit'
  | 'too_many_tries'
  | 'minor';

/** Rule 11: any case, spaces and hyphens ignored; only A–Z and 0–9 kept, at most 8. */
export function normaliseRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

/** Codes display as GRAC-E24A. */
export function formatRoomCode(code: string): string {
  const c = normaliseRoomCode(code);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** True for a code the server could have generated. */
export function isRoomCode(code: string): boolean {
  return code.length === ROOM_CODE_LENGTH && [...code].every((ch) => ROOM_CODE_ALPHABET.includes(ch));
}

/** Rule 12: "Join room · 1 more character" until 8 are filled. */
export function joinButtonLabel(filled: number): string {
  const left = ROOM_CODE_LENGTH - filled;
  if (left <= 0) return 'Join room';
  return `Join room · ${left} more character${left === 1 ? '' : 's'}`;
}

/** Rule 13 messages under the boxes. `retryAt` is shown as Lagos time (14:30). */
export function joinErrorMessage(status: JoinStatus, retryAt?: string | Date): string | null {
  switch (status) {
    case 'not_found':
      return "We couldn't find a room with that code.";
    case 'ended':
      return 'This room has ended.';
    case 'full':
      return 'This room is full.';
    case 'room_limit':
      return "You're in 20 rooms. Leave one to join another.";
    case 'minor':
      return "This room isn't open to under-18s.";
    case 'too_many_tries':
      return retryAt ? `Too many tries. Try again at ${lagosTime(retryAt)}.` : 'Too many tries.';
    default:
      return null;
  }
}

export function roomNameError(name: string): string | null {
  const n = name.trim();
  if (n.length < ROOM_NAME_MIN) return `Use at least ${ROOM_NAME_MIN} characters.`;
  if ([...n].length > ROOM_NAME_MAX) return `Use ${ROOM_NAME_MAX} characters or fewer.`;
  return null;
}

const DAY = 86_400_000;

/**
 * Rule 7: when a paced room should finish, from the chapters the creator hasn't finished and the
 * start date. Free pace has no date (null).
 */
export function paceFinishDate(pace: RoomPace, chaptersLeft: number, start: Date = new Date()): Date | null {
  if (pace === 'free') return null;
  const left = Math.max(0, Math.ceil(chaptersLeft));
  const days = pace === 'one_day' ? left : Math.ceil((left / 3) * 7);
  return new Date(start.getTime() + days * DAY);
}

/** "Finishes around 28 December" (null for Free). */
export function paceFinishLine(
  pace: RoomPace,
  chaptersLeft: number,
  start: Date = new Date(),
): string | null {
  const d = paceFinishDate(pace, chaptersLeft, start);
  if (!d) return null;
  const day = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Africa/Lagos',
  }).format(d);
  return `Finishes around ${day}`;
}

/**
 * Rule 18: a message is a spoiler when the sender's chapter is ahead of the viewer's. Unknown
 * chapters count as 0, so a sender with no progress is never hidden.
 */
export function isSpoiler(
  senderChapter: number | null | undefined,
  viewerChapter: number | null | undefined,
): boolean {
  return (senderChapter ?? 0) > (viewerChapter ?? 0);
}

/**
 * The chapter a message counts as for spoilers: the stamp from Postgres for history, and for live
 * messages (not stamped yet) the sender's room progress. A quote from a later chapter wins.
 */
export function messageSpoilerChapter(m: {
  spoiler_chapter?: number | null;
  quote?: { chapter: number } | null;
  senderChapter?: number | null;
}): number {
  return Math.max(m.spoiler_chapter ?? m.senderChapter ?? 0, m.quote?.chapter ?? 0);
}

/**
 * Room extra on the chat socket: a member's progress changed (sent by the api Worker's
 * progress-sync through the room's Durable Object).
 */
export interface RoomProgressFrame {
  type: 'progress';
  user_id: string;
  percent: number;
  chapter: number;
  finished: boolean;
}

/** Rooms add one composer block to flow 06's: accounts under 7 days can't post (rule: new accounts). */
export const ROOM_NEW_ACCOUNT_BLOCK = 'new_account';
export const ROOM_NEW_ACCOUNT_COPY = 'New accounts can post after 7 days.';

/** Progress-sync runs at most this often while the room's book is open (rule 24). */
export const ROOM_PROGRESS_SYNC_MS = 15_000;

/** Rule 2: "Active today" / "Active yesterday" / "Active 3 days ago", never a raw date. */
export function activeLabel(at: string | Date, now: Date = new Date()): string {
  const days = lagosDayIndex(now) - lagosDayIndex(new Date(at));
  if (days <= 0) return 'Active today';
  if (days === 1) return 'Active yesterday';
  return `Active ${days} days ago`;
}

/** Rule 22: "You are 2 chapters behind the room" (null when on pace). */
export function behindLine(behind: number): string | null {
  if (behind <= 0) return null;
  return `You are ${behind} chapter${behind === 1 ? '' : 's'} behind the room`;
}

/** Room card meta: "5 members · 2 finished". */
export function membersLine(members: number, finished: number): string {
  return `${members} member${members === 1 ? '' : 's'} · ${finished} finished`;
}

function lagosDayIndex(d: Date): number {
  // Lagos is UTC+1 all year (no daylight saving).
  return Math.floor((d.getTime() + 3_600_000) / DAY);
}

function lagosTime(at: string | Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Lagos',
  }).format(new Date(at));
}
