/** Team ID + bundle ID of the iOS app (docs/prd/README.md), and the share links the app handles. */
export const APP_ID = 'FV22ZB99P8.africa.arpedia.reader';

export const AASA = {
  applinks: {
    details: [
      {
        appIDs: [APP_ID],
        components: ['/c/*', '/r/*', '/book/*', '/author/*', '/community/*'].map((p) => ({ '/': p })),
      },
    ],
  },
};
