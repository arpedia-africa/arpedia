import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './prototype.css';
import './console.css';

export const metadata: Metadata = {
  title: 'Arpedia Admin',
  robots: { index: false, follow: false },
  icons: { icon: '/brand/mark.png' },
};

// Same fonts as the admin prototype head (admin/src/00-head.html).
const FONTS =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=JetBrains+Mono:wght@400;600&display=swap';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-NG" data-theme="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
