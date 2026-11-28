import { describe, expect, it } from 'vitest';
import { ipAndPlace } from './shared';

// Spec check 16-27: "IP and place" as the prototype writes it.
describe('ipAndPlace', () => {
  it('list: address and city', () => {
    expect(ipAndPlace('105.112.34.18', 'Lagos')).toBe('105.112.34.18 · Lagos');
  });
  it('entry: address, city and country name', () => {
    expect(ipAndPlace('105.112.34.18', 'Lagos', 'NG')).toBe('105.112.34.18 · Lagos, Nigeria');
  });
  it('older entries keep just the address, or a dash', () => {
    expect(ipAndPlace('102.89.40.113', null)).toBe('102.89.40.113');
    expect(ipAndPlace(null, null, null)).toBe('–');
    expect(ipAndPlace(null, 'Abuja')).toBe('Abuja');
  });
});
