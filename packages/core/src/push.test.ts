import { describe, expect, it } from 'vitest';
import {
  type PushPrefs,
  type PushRecipient,
  type PushTypeRule,
  abBucket,
  abWinner,
  chunks,
  cohortCell,
  csvCell,
  dauMau,
  decidePush,
  funnel,
  groupFigure,
  inMarketingBlock,
  inQuietWindow,
  periodChange,
  previewText,
  previousPeriod,
  quietWindowEnd,
  releasePlan,
  renderTemplate,
} from './push';

const type = (over: Partial<PushTypeRule> = {}): PushTypeRule => ({
  key: 'club_message',
  category: 'messages',
  enabled: true,
  quiet_action: 'hold',
  capped: false,
  collapse_key: 'group',
  ttl_seconds: 86400,
  title_template: '{{group_name}}',
  body_template: '{{sender}}: {{preview}}',
  ...over,
});
const MARKETING = type({ key: 'campaign', category: 'marketing', quiet_action: 'drop', capped: true });
const prefs = (over: Partial<PushPrefs> = {}): PushPrefs => ({
  messages_level: 'all',
  authors_new: true,
  note_replies: true,
  reading_reminders: true,
  marketing: true,
  quiet_hours_on: true,
  quiet_start: '22:00',
  quiet_end: '06:00',
  timezone: 'Africa/Lagos',
  ...over,
});
const reader = (over: Partial<PushRecipient> = {}): PushRecipient => ({
  user_id: 'u1',
  tokens: ['ExponentPushToken[abc]'],
  prefs: prefs(),
  marketing_7d: 0,
  is_minor: false,
  group_muted: false,
  blocked: false,
  author_pushed_today: false,
  ...over,
});
// 12:00 WAT (UTC+1) on 19 Nov 2026.
const NOON = new Date('2026-11-19T11:00:00Z');
const at = (iso: string) => ({ at: new Date(iso) });

describe('quiet hours across time zones', () => {
  it('handles a window that crosses midnight', () => {
    expect(inQuietWindow(new Date('2026-11-19T21:30:00Z'), 'Africa/Lagos', '22:00', '06:00')).toBe(true); // 22:30
    expect(inQuietWindow(new Date('2026-11-19T04:59:00Z'), 'Africa/Lagos', '22:00', '06:00')).toBe(true); // 05:59
    expect(inQuietWindow(new Date('2026-11-19T05:00:00Z'), 'Africa/Lagos', '22:00', '06:00')).toBe(false); // 06:00
    expect(inQuietWindow(NOON, 'Africa/Lagos', '22:00', '06:00')).toBe(false);
  });
  it('uses the reader’s zone, not WAT', () => {
    const t = new Date('2026-11-19T20:30:00Z'); // 21:30 Lagos, 22:30 Nairobi, 20:30 London
    expect(inQuietWindow(t, 'Africa/Lagos', '22:00', '06:00')).toBe(false);
    expect(inQuietWindow(t, 'Africa/Nairobi', '22:00', '06:00')).toBe(true);
    expect(inQuietWindow(t, 'Europe/London', '22:00', '06:00')).toBe(false);
  });
  it('handles a same-day window and an empty one', () => {
    expect(inQuietWindow(NOON, 'Africa/Lagos', '11:00', '13:00')).toBe(true);
    expect(inQuietWindow(NOON, 'Africa/Lagos', '13:00', '15:00')).toBe(false);
    expect(inQuietWindow(NOON, 'Africa/Lagos', '22:00', '22:00')).toBe(false);
  });
  it('falls back to Lagos for an unknown zone', () => {
    expect(inQuietWindow(new Date('2026-11-19T21:30:00Z'), 'Mars/Base', '22:00', '06:00')).toBe(true);
  });
  it('finds the end of the window, before and after midnight', () => {
    expect(quietWindowEnd(new Date('2026-11-19T21:30:00Z'), 'Africa/Lagos', '22:00', '06:00').toISOString()).toBe(
      '2026-11-20T05:00:00.000Z',
    );
    expect(quietWindowEnd(new Date('2026-11-20T02:15:30Z'), 'Africa/Lagos', '22:00', '06:00').toISOString()).toBe(
      '2026-11-20T05:00:00.000Z',
    );
    expect(quietWindowEnd(new Date('2026-11-19T20:00:00Z'), 'Africa/Nairobi', '22:00', '06:00').toISOString()).toBe(
      '2026-11-20T03:00:00.000Z',
    );
    expect(quietWindowEnd(NOON, 'Africa/Lagos', '22:00', '06:00')).toBe(NOON);
  });
  it('blocks marketing 22:00 to 07:00 WAT', () => {
    expect(inMarketingBlock(new Date('2026-11-19T05:30:00Z'))).toBe(true); // 06:30 WAT
    expect(inMarketingBlock(new Date('2026-11-19T06:00:00Z'))).toBe(false); // 07:00 WAT
  });
});

describe('decidePush', () => {
  it('sends by default', () => {
    expect(decidePush(type(), reader(), { at: NOON })).toEqual({ action: 'send' });
  });
  it('honours staff switch, blocks, mutes, open chat and devices', () => {
    expect(decidePush(type({ enabled: false }), reader(), { at: NOON })).toMatchObject({ reason: 'type_off' });
    expect(decidePush(type(), reader({ blocked: true }), { at: NOON })).toMatchObject({ reason: 'blocked' });
    expect(decidePush(type(), reader({ group_muted: true }), { at: NOON })).toMatchObject({ reason: 'muted' });
    expect(decidePush(type(), reader(), { at: NOON, chatOpen: true })).toMatchObject({ reason: 'chat_open' });
    expect(decidePush(type(), reader({ tokens: [] }), { at: NOON })).toMatchObject({ reason: 'no_token' });
  });
  it('applies the message level', () => {
    const m = reader({ prefs: prefs({ messages_level: 'mentions' }) });
    expect(decidePush(type(), m, { at: NOON })).toMatchObject({ status: 'skipped_pref', reason: 'pref_mentions' });
    expect(decidePush(type(), m, { at: NOON, mentioned: true })).toEqual({ action: 'send' });
    const off = reader({ prefs: prefs({ messages_level: 'off' }) });
    expect(decidePush(type({ key: 'room_starting' }), off, { at: NOON })).toMatchObject({ reason: 'pref_off' });
    // A DM reply from an author is not a group message.
    expect(decidePush(type({ key: 'author_reply' }), off, { at: NOON })).toEqual({ action: 'send' });
  });
  it('applies category preferences; Account always goes', () => {
    const none = reader({
      prefs: prefs({ authors_new: false, note_replies: false, reading_reminders: false, marketing: false }),
    });
    expect(decidePush(type({ key: 'author_new_post', category: 'authors' }), none, at('2026-11-19T11:00:00Z')))
      .toMatchObject({ reason: 'pref_off' });
    expect(decidePush(type({ key: 'note_reply' }), none, { at: NOON })).toMatchObject({ reason: 'pref_off' });
    expect(decidePush(type({ key: 'reading_reminder', category: 'reminders' }), none, { at: NOON }))
      .toMatchObject({ reason: 'pref_off' });
    expect(decidePush(MARKETING, none, { at: NOON })).toMatchObject({ reason: 'pref_off' });
    expect(decidePush(MARKETING, none, { at: NOON, isService: true })).toEqual({ action: 'send' });
    expect(decidePush(type({ key: 'renewal_failed', category: 'account', quiet_action: 'deliver' }), none, { at: NOON }))
      .toEqual({ action: 'send' });
  });
  it('sends no marketing to minors', () => {
    expect(decidePush(MARKETING, reader({ is_minor: true }), { at: NOON })).toMatchObject({ reason: 'minor' });
  });
  it('batches author pushes to one per author per day', () => {
    const t = type({ key: 'author_new_post', category: 'authors' });
    expect(decidePush(t, reader({ author_pushed_today: true }), { at: NOON })).toMatchObject({
      reason: 'author_batched',
    });
  });
  it('caps marketing at 2 per 7 days, unless switched off or service', () => {
    const r = reader({ marketing_7d: 2 });
    expect(decidePush(MARKETING, r, { at: NOON })).toEqual({ action: 'skip', status: 'skipped_cap', reason: 'cap' });
    expect(decidePush(MARKETING, reader({ marketing_7d: 1 }), { at: NOON })).toEqual({ action: 'send' });
    expect(decidePush(MARKETING, r, { at: NOON, skipCapped: false })).toEqual({ action: 'send' });
    expect(decidePush(MARKETING, r, { at: NOON, isService: true })).toEqual({ action: 'send' });
  });
  it('holds, delivers later or drops in quiet hours', () => {
    const night = new Date('2026-11-19T22:30:00Z'); // 23:30 WAT
    const morning = '2026-11-20T05:00:00.000Z';
    const held = decidePush(type(), reader(), { at: night });
    expect(held).toMatchObject({ action: 'hold', dropIfOlder: true });
    expect(held.action === 'hold' && held.releaseAt.toISOString()).toBe(morning);
    const acct = decidePush(type({ category: 'account', quiet_action: 'deliver' }), reader(), { at: night });
    expect(acct).toMatchObject({ action: 'hold', dropIfOlder: false });
    expect(decidePush(type({ key: 'room_starting', quiet_action: 'drop' }), reader(), { at: night })).toMatchObject({
      status: 'skipped_quiet',
    });
    // Reader turned quiet hours off: messages go.
    expect(decidePush(type(), reader({ prefs: prefs({ quiet_hours_on: false }) }), { at: night })).toEqual({
      action: 'send',
    });
  });
  it('blocks marketing 22:00–07:00 WAT whatever the reader set', () => {
    const r = reader({ prefs: prefs({ quiet_hours_on: false }) });
    expect(decidePush(MARKETING, r, at('2026-11-19T05:30:00Z'))).toMatchObject({ reason: 'marketing_block' });
    // A Super admin override sends urgent service pushes at any time.
    expect(decidePush(MARKETING, r, { ...at('2026-11-19T05:30:00Z'), isService: true, respectQuiet: false }))
      .toEqual({ action: 'send' });
  });
});

describe('releasePlan', () => {
  const now = new Date('2026-11-20T05:00:00Z');
  const h = (category: 'messages' | 'account', hoursAgo: number) => ({
    category,
    held_at: new Date(now.getTime() - hoursAgo * 3_600_000),
  });
  it('sends up to 3 messages one by one', () => {
    const p = releasePlan([h('messages', 1), h('messages', 2), h('messages', 3)], now);
    expect(p.send).toHaveLength(3);
    expect(p.summary).toHaveLength(0);
  });
  it('folds more than 3 into one summary and drops ones held over 12 hours', () => {
    const p = releasePlan(
      [h('messages', 1), h('messages', 2), h('messages', 3), h('messages', 4), h('messages', 13), h('account', 13)],
      now,
    );
    expect(p.summary).toHaveLength(4);
    expect(p.dropped).toHaveLength(1);
    expect(p.send).toEqual([h('account', 13)]);
  });
});

describe('A/B title test', () => {
  it('picks the higher open rate, A on a tie', () => {
    expect(abWinner({ sent: 100, opened: 10 }, { sent: 100, opened: 14 })).toBe('b');
    expect(abWinner({ sent: 100, opened: 14 }, { sent: 50, opened: 7 })).toBe('a');
    expect(abWinner({ sent: 0, opened: 0 }, { sent: 0, opened: 0 })).toBe('a');
  });
  it('puts about 20% in the test, split evenly, stable per reader', () => {
    const ids = Array.from({ length: 10000 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    const counts = { a: 0, b: 0, rest: 0 };
    for (const id of ids) counts[abBucket(id)]++;
    expect(counts.a + counts.b).toBeGreaterThan(1800);
    expect(counts.a + counts.b).toBeLessThan(2200);
    expect(Math.abs(counts.a - counts.b)).toBeLessThan(250);
    expect(abBucket(ids[7]!)).toBe(abBucket(ids[7]!));
  });
});

describe('batching and text', () => {
  it('chunks into batches', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunks([], 100)).toEqual([]);
  });
  it('renders templates and previews', () => {
    expect(renderTemplate('{{sender}}: {{preview}}', { sender: 'Ada', preview: 'hi' })).toBe('Ada: hi');
    expect(renderTemplate('New reply from {{author}} {{missing}}', { author: 'Chimamanda' })).toBe(
      'New reply from Chimamanda',
    );
    const long = 'a'.repeat(120);
    expect(previewText(long)).toHaveLength(80);
    expect(previewText('short  text\n')).toBe('short text');
  });
});

describe('insights maths', () => {
  it('hides groups under 5', () => {
    expect(groupFigure(4)).toBe('Fewer than 5');
    expect(groupFigure(1240)).toBe('1,240');
  });
  it('compares with the previous period of the same length', () => {
    expect(previousPeriod('2026-11-13', '2026-11-19')).toEqual({ from: '2026-11-06', to: '2026-11-12' });
    expect(previousPeriod('2026-11-01', '2026-11-01')).toEqual({ from: '2026-10-31', to: '2026-10-31' });
    expect(periodChange(120, 100)).toBe(20);
    expect(periodChange(90, 120)).toBe(-25);
    expect(periodChange(5, 0)).toBeNull();
  });
  it('rolls up DAU/MAU', () => {
    expect(dauMau(1800, 6000)).toBe(30);
    expect(dauMau(10, 0)).toBe(0);
  });
  it('builds retention cohorts, young ones labelled', () => {
    // Week of Mon 2 Nov: day 30 is known from 8 Dec.
    expect(cohortCell('2026-11-02', 30, '2026-11-19', 200, 50)).toEqual({ state: 'young', label: 'Day 30 on 8 Dec' });
    expect(cohortCell('2026-11-02', 7, '2026-11-19', 200, 90)).toEqual({ state: 'ready', pct: 45 });
    expect(cohortCell('2026-11-02', 1, '2026-11-19', 4, 3)).toEqual({ state: 'small' });
  });
  it('points out the biggest funnel drop', () => {
    const f = funnel([
      { key: 'installed', count: 1000 },
      { key: 'signed_up', count: 700 },
      { key: 'picked_interests', count: 650 },
      { key: 'subscribed', count: 200 },
    ]);
    expect(f.rows.map((r) => r.kept)).toEqual([100, 70, 93, 31]);
    expect(f.biggestDrop).toBe('subscribed');
  });
});

describe('csv', () => {
  it('quotes and defuses formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(-42)).toBe('-42');
    expect(csvCell(null)).toBe('');
  });
});
