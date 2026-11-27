/** Old v25 URLs and short names that now live elsewhere. Used by next.config.ts. */
export const redirects = [
  { source: '/privacy', destination: '/legal/privacy', permanent: true },
  { source: '/terms', destination: '/legal/terms', permanent: true },
  { source: '/copyright', destination: '/legal/copyright', permanent: true },
  { source: '/delete-account', destination: '/legal/delete-account', permanent: true },
  { source: '/help', destination: '/support', permanent: true },
  // The console's policy slug is "refunds"; "refund" is what people type.
  { source: '/legal/refund', destination: '/legal/refunds', permanent: true },
];
