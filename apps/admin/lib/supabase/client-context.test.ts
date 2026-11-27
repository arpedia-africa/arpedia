import { describe, expect, it } from 'vitest';
import { clientContextHeaders } from './client-context';

const h = (o: Record<string, string>) => new Headers(o);

describe('clientContextHeaders (flow 16 rule 22)', () => {
  it('passes the browser address, device and request id on', () => {
    expect(
      clientContextHeaders(
        h({
          'x-forwarded-for': '102.89.1.7, 76.76.21.1',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/131',
          'x-vercel-id': 'cdg1::abcd-123',
        }),
      ),
    ).toEqual({
      'x-client-ip': '102.89.1.7',
      'x-client-user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/131',
      'x-client-request-id': 'cdg1::abcd-123',
    });
  });

  it('falls back to x-real-ip and x-request-id, and reads IPv6', () => {
    expect(clientContextHeaders(h({ 'x-real-ip': '2c0f:f5c0::1', 'x-request-id': 'r1' }))).toEqual({
      'x-client-ip': '2c0f:f5c0::1',
      'x-client-request-id': 'r1',
    });
  });

  it('drops an address that is not one and caps a long user agent', () => {
    const out = clientContextHeaders(h({ 'x-forwarded-for': '<script>', 'user-agent': 'a'.repeat(500) }));
    expect(out['x-client-ip']).toBeUndefined();
    expect(out['x-client-user-agent']).toHaveLength(300);
  });

  it('sends nothing when there is nothing to send (local dev, a build step)', () => {
    expect(clientContextHeaders(h({}))).toEqual({});
  });
});
