import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@arpedia/core', '@arpedia/ui'],
  poweredByHeader: false,
};

export default config;
