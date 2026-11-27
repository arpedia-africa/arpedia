import type { Metadata } from 'next';
import { Page, StoreBadges } from '@/components/chrome';

export interface ShareInfo {
  kicker: string;
  title: string;
  body: string;
  /** Shown as letter boxes (room codes). */
  code?: string;
  /** arpedia:// link for "Open in the app". */
  open: string;
}

/**
 * Where a shared link lands for someone without the app. With the app installed, the phone opens it
 * directly once the domain is verified (assetlinks.json and apple-app-site-association). Nothing
 * here redirects, so link previews (WhatsApp) read the title and image first.
 */
export function ShareLanding({ info }: { info: ShareInfo }) {
  return (
    <Page className="landing">
      <div className="wrap">
        <div className="landing__card">
          <p className="eyebrow">{info.kicker}</p>
          <h1>{info.title}</h1>
          <p className="lede">{info.body}</p>
          {info.code ? (
            <div className="code" role="img" aria-label={`Room code ${info.code.split('').join(' ')}`}>
              {info.code.split('').map((c, i) => (
                <span key={i} aria-hidden>
                  {c}
                </span>
              ))}
            </div>
          ) : null}
          <div className="landing__actions">
            <a className="btn btn-p" href={info.open}>
              Open in the app
            </a>
            <p className="landing__or">Don&apos;t have Arpedia yet? Get it here.</p>
            <StoreBadges />
          </div>
        </div>
      </div>
    </Page>
  );
}

/** Preview tags for a share page. Not indexed: these are personal links. */
export function shareMetadata(title: string, description: string): Metadata {
  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: { title: `${title} | Arpedia`, description, type: 'website' },
  };
}
