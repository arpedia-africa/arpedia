// The staging test build (`tools/android-release.mjs --staging`, owner decision 24 Nov): package
// com.arpedia.reader.staging, named "Arpedia Test", so it installs beside the v25 app and the
// release build. Without ARPEDIA_STAGING=1 this changes nothing (production stays as it is).
module.exports = function withStagingVariant(config) {
  if (process.env.ARPEDIA_STAGING !== '1') return config;
  return {
    ...config,
    name: 'Arpedia Test',
    android: { ...config.android, package: 'com.arpedia.reader.staging' },
  };
};
