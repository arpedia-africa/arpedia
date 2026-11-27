// Android App Links: lets com.arpedia.reader open arpedia.africa links directly.
// The fingerprint is the one on the v25 site (same app package and signing key).
const body = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.arpedia.reader',
      sha256_cert_fingerprints: [
        '53:8B:2F:52:4F:B9:CF:ED:C5:8D:C6:C5:E0:14:94:7D:45:B3:99:09:90:6F:FE:AB:43:43:46:A7:D9:70:48:DD',
      ],
    },
  },
];

export const dynamic = 'force-static';

export function GET() {
  return Response.json(body, { headers: { 'Content-Type': 'application/json' } });
}
