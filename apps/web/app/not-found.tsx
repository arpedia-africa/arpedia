import { Page } from '@/components/chrome';

export const metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
  return (
    <Page className="doc">
      <div className="wrap doc__in">
        <p className="eyebrow">404</p>
        <h1>We could not find that page</h1>
        <div className="prose" style={{ marginTop: 20 }}>
          <p>The link may be old or mistyped.</p>
          <a className="btn btn-p" href="/">
            Go to the home page
          </a>
        </div>
      </div>
    </Page>
  );
}
