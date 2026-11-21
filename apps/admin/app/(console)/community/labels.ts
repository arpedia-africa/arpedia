export type GroupKind = 'official' | 'club' | 'author' | 'readalong' | 'room' | 'dm';
export type WhoCanPost = 'members' | 'staff' | 'owner_and_followers';

export const KIND_LABEL: Record<GroupKind, string> = {
  official: 'Official',
  club: 'Club',
  author: 'Author',
  readalong: 'Read-along',
  room: 'Reading room',
  dm: 'Message',
};

export const WHO_LABEL: Record<WhoCanPost, string> = {
  members: 'Members',
  staff: 'Staff only',
  owner_and_followers: 'Author and followers',
};

/** "members post", "staff only post", "author and followers post", with slow mode. */
export function postingLine(who: WhoCanPost, slowMode: number) {
  const base = `${WHO_LABEL[who].toLowerCase()} post`;
  return slowMode > 0 ? `${base}, slow mode ${slowLabel(slowMode)}` : base;
}

export const SLOW_OPTIONS = [0, 10, 30, 60, 300, 900, 3600];

export function slowLabel(s: number) {
  if (s === 0) return 'Off';
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${s / 60} min`;
  return '1 hour';
}

/** Staff show as the team on reader-facing names; the console says "Arpedia team". */
export const ownerLabel = (name: string | null) => (!name || name === 'Arpedia Team' ? 'Arpedia team' : name);

export const num = (n: number) => n.toLocaleString('en-US');

export const initials = (name: string) =>
  name
    .replace(/^@/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]!.toUpperCase())
    .join('');

const AVATAR = ['r', 'o', 'g', 'k', 't', 'n', 'b', 'm'];
export const avatarClass = (i: number) => AVATAR[i % AVATAR.length];
