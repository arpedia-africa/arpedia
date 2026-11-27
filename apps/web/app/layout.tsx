import type { Metadata, Viewport } from 'next';
import './globals.css';
import { DESCRIPTION, SITE_URL, TAGLINE } from '@/lib/site';

const TITLE = `Arpedia: ${TAGLINE}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: '%s | Arpedia' },
  description: DESCRIPTION,
  applicationName: 'Arpedia',
  openGraph: {
    siteName: 'Arpedia',
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    locale: 'en_NG',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Arpedia' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/og.png'] },
  alternates: { canonical: './' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5931F' },
    { media: '(prefers-color-scheme: dark)', color: '#14110D' },
  ],
  colorScheme: 'light dark',
};

// Same fonts as the app and admin prototypes (DESIGN.md).
const FONTS =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&display=swap';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
