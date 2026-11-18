'use client';

export default function ConsoleError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="screen">
      <div className="page">
        <div className="panel" role="alert">
          <div className="empty" style={{ padding: '64px 24px' }}>
            <b>This page didn’t load</b>
            <span>Check your connection and try again. If it keeps happening, tell engineering.</span>
            <button type="button" className="btn btn-p" onClick={reset}>
              Try again
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
