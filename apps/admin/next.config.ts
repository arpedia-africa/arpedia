import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@arpedia/convert', '@arpedia/core', '@arpedia/reader', '@arpedia/ui'],
  poweredByHeader: false,
};

export default config;
