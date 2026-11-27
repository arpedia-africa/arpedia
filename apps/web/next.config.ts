import type { NextConfig } from 'next';
import { redirects as list } from './lib/redirects';

const config: NextConfig = {
  poweredByHeader: false,
  redirects: async () => list,
  headers: async () => [
    {
      source: '/.well-known/:file*',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }],
    },
  ],
};

export default config;
