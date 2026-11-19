import { describe, expect, it } from 'vitest';
import {
  ROOM_CODE_ALPHABET,
  activeLabel,
  behindLine,
  formatRoomCode,
  isRoomCode,
  isSpoiler,
  joinButtonLabel,
  joinErrorMessage,
  normaliseRoomCode,
  paceFinishDate,
  paceFinishLine,
  roomNameError,
} from './rooms';

describe('room codes', () => {
  it('ignores case, spaces and hyphens', () => {
    expect(normaliseRoomCode(' grac-e24a ')).toBe('GRACE24A');
    expect(normaliseRoomCode('gr ac e2 4a')).toBe('GRACE24A');
  });
  it('keeps at most 8 characters', () => {
    expect(normaliseRoomCode('ABCDEFGHJK')).toBe('ABCDEFGH');
  });
  it('displays as two groups of four', () => {
    expect(formatRoomCode('grace24a')).toBe('GRAC-E24A');
    expect(formatRoomCode('GRA')).toBe('GRA');
  });
  it('alphabet has no 0 O 1 I and 32 characters', () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(32);
    for (const ch of '0O1I') expect(ROOM_CODE_ALPHABET).not.toContain(ch);
    expect(isRoomCode('GRACE24A')).toBe(true);
    expect(isRoomCode('GRACE10A')).toBe(false);
    expect(isRoomCode('GRACE2')).toBe(false);
  });
  it('button says what is missing', () => {
    expect(joinButtonLabel(7)).toBe('Join room · 1 more character');
    expect(joinButtonLabel(5)).toBe('Join room · 3 more characters');
    expect(joinButtonLabel(8)).toBe('Join room');
  });
  it('error messages', () => {
    expect(joinErrorMessage('not_found')).toBe("We couldn't find a room with that code.");
    expect(joinErrorMessage('ended')).toBe('This room has ended.');
    expect(joinErrorMessage('full')).toBe('This room is full.');
    expect(joinErrorMessage('too_many_tries', '2026-11-19T13:30:00Z')).toBe(
      'Too many tries. Try again at 14:30.',
    );
    expect(joinErrorMessage('joined')).toBeNull();
  });
});

describe('room name', () => {
  it('3 to 40 characters, trimmed, emoji count once', () => {
    expect(roomNameError('  ab ')).not.toBeNull();
    expect(roomNameError('abc')).toBeNull();
    expect(roomNameError('a'.repeat(41))).not.toBeNull();
    expect(roomNameError('📚'.repeat(40))).toBeNull();
  });
});

describe('pace finish date', () => {
  const start = new Date('2026-11-23T09:00:00Z');
  it('free has no date', () => {
    expect(paceFinishDate('free', 30, start)).toBeNull();
    expect(paceFinishLine('free', 30, start)).toBeNull();
  });
  it('one chapter a day', () => {
    expect(paceFinishDate('one_day', 35, start)?.toISOString()).toBe('2026-12-28T09:00:00.000Z');
    expect(paceFinishLine('one_day', 35, start)).toBe('Finishes around 28 December');
  });
  it('three chapters a week rounds up to whole days', () => {
    // 14 chapters = 4.67 weeks = 32.67 days → 33 days.
    expect(paceFinishDate('three_week', 14, start)?.toISOString()).toBe('2026-12-26T09:00:00.000Z');
    expect(paceFinishDate('three_week', 0, start)?.toISOString()).toBe(start.toISOString());
  });
});

describe('spoilers', () => {
  it('hides only messages from readers ahead of me', () => {
    expect(isSpoiler(22, 14)).toBe(true);
    expect(isSpoiler(14, 14)).toBe(false);
    expect(isSpoiler(3, 14)).toBe(false);
  });
  it('unknown chapters count as 0', () => {
    expect(isSpoiler(null, 0)).toBe(false);
    expect(isSpoiler(undefined, 5)).toBe(false);
    expect(isSpoiler(1, null)).toBe(true);
  });
});

describe('labels', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  it('active today, yesterday, N days ago (Lagos days)', () => {
    expect(activeLabel('2026-11-19T00:30:00Z', now)).toBe('Active today');
    expect(activeLabel('2026-11-18T23:30:00Z', now)).toBe('Active today');
    expect(activeLabel('2026-11-18T10:00:00Z', now)).toBe('Active yesterday');
    expect(activeLabel('2026-11-16T10:00:00Z', now)).toBe('Active 3 days ago');
  });
  it('behind line', () => {
    expect(behindLine(0)).toBeNull();
    expect(behindLine(1)).toBe('You are 1 chapter behind the room');
    expect(behindLine(2)).toBe('You are 2 chapters behind the room');
  });
});
