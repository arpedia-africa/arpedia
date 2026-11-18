// The kit gallery ships only in development builds, and in the CI e2e build (EXPO_PUBLIC_KIT=1)
// so Maestro can open it from a release APK.
export const kitEnabled = __DEV__ || process.env.EXPO_PUBLIC_KIT === '1';
