import { POLICIES } from '@/lib/legal';
import { stores } from '@/lib/stores';
import { SUPPORT_EMAIL } from '@/lib/site';

/** Google Play badge, plus the App Store badge once NEXT_PUBLIC_APP_STORE_URL is set. */
export function StoreBadges({ className = '' }: { className?: string }) {
  return (
    <div className={`badges ${className}`.trim()}>
      <a href={stores.play} className="badge">
        <img src="/badges/google-play-badge.svg" alt="Get it on Google Play" width={162} height={48} />
      </a>
      {stores.appStore ? (
        <a href={stores.appStore} className="badge">
          <img src="/badges/app-store-badge.svg" alt="Download on the App Store" width={144} height={48} />
        </a>
      ) : null}
    </div>
  );
}

export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Arpedia home">
      <img src="/mark.png" alt="" width={36} height={36} />
      <span>arpedia</span>
    </a>
  );
}

const nav = [
  { href: '/#readers', label: 'Readers' },
  { href: '/#credits', label: 'Credits' },
  { href: '/#authors', label: 'Authors' },
  { href: '/#community', label: 'Community' },
  { href: '/support', label: 'Support' },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="wrap site-header__in">
        <Brand />
        <nav className="site-nav" aria-label="Main">
          {nav.map((n) => (
            <a key={n.href} href={n.href}>
              {n.label}
            </a>
          ))}
        </nav>
        <a className="btn btn-p btn-sm" href="/#download">
          Get the app
        </a>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap site-footer__in">
        <div className="site-footer__brand">
          <Brand />
          <p>Community at the heart of African stories.</p>
          <StoreBadges />
        </div>
        <nav aria-label="Policies">
          <h2>Policies</h2>
          <ul>
            {POLICIES.map((p) => (
              <li key={p.slug}>
                <a href={`/legal/${p.slug}`}>
                  {p.title.replace('Delete your Arpedia account', 'Delete account')}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Help">
          <h2>Help</h2>
          <ul>
            <li>
              <a href="/support">Support</a>
            </li>
            <li>
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </li>
            <li>
              <a href="mailto:authors@arpedia.africa">authors@arpedia.africa</a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="wrap site-footer__legal">
        <small>© {new Date().getFullYear()} Arpedia. Made in Nigeria.</small>
      </div>
    </footer>
  );
}

/** Page frame for every inner page. */
export function Page({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className={className}>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
