import { describe, expect, it } from 'vitest';
import { MIN_SCALE, scaleFor, scaled } from './scale';

describe('scaleFor', () => {
  it('is 1 at the design width and above', () => {
    expect(scaleFor(375)).toBe(1);
    expect(scaleFor(412)).toBe(1);
    expect(scaleFor(800)).toBe(1);
  });
  it('scales proportionally between 320 and 375', () => {
    expect(scaleFor(360)).toBeCloseTo(0.96, 5);
    expect(scaleFor(340)).toBeCloseTo(340 / 375, 5);
  });
  it('never goes below 0.85', () => {
    expect(scaleFor(320)).toBeCloseTo(320 / 375, 5);
    expect(scaleFor(318)).toBe(MIN_SCALE);
    expect(scaleFor(280)).toBe(MIN_SCALE);
  });
  it('falls back to 1 for a missing width', () => {
    expect(scaleFor(0)).toBe(1);
    expect(scaleFor(Number.NaN)).toBe(1);
  });
});

describe('scaled', () => {
  it('scales sizes and keeps pills round', () => {
    expect(scaled(16, 1)).toBe(16);
    expect(scaled(48, 0.85)).toBe(40.8);
    expect(scaled(15, 0.96)).toBe(14.4);
    expect(scaled(999, 0.85)).toBe(999);
  });
});
