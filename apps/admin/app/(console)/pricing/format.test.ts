import { describe, expect, it } from 'vitest';
import { describeChange, ruleValue, type Rules } from './format';

const launch: Rules = {
  words_per_page: 250,
  credits_per_page: 0.5,
  credit_value_kobo: 300,
  preview_pct: 10,
  split_pages: 20,
  undo_minutes: 10,
  author_rate_kobo: 160,
  rollover_cap_plans: 1,
  pause_max_months: 3,
  auto_unlock_default: true,
  store_fee_pct: 15,
};

describe('Pay as you read rule (16-24)', () => {
  it('reads a version saved before the switch as On', () => {
    expect(describeChange(launch, { ...launch, pay_as_you_read: true })).toEqual([]);
  });

  it('names the switch when it is turned off and back on', () => {
    expect(describeChange(launch, { ...launch, pay_as_you_read: false })).toEqual(['Pay as you read On to Off']);
    expect(describeChange({ ...launch, pay_as_you_read: false }, launch)).toEqual(['Pay as you read Off to On']);
  });

  it('shows the flag as On or Off', () => {
    expect(ruleValue('pay_as_you_read', false)).toBe('Off');
    expect(ruleValue('pay_as_you_read', true)).toBe('On');
  });
});
