import type { Metadata } from 'next';
import { Page, StoreBadges } from '@/components/chrome';
import { stores } from '@/lib/stores';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

const why = [
  {
    title: 'The author is in the room',
    body: 'Ask the writer what they meant, and follow them to their next book.',
  },
  {
    title: 'Nobody reads alone',
    body: 'Join a club, keep pace with a chapter thread, and share the lines that stopped you.',
  },
  {
    title: 'Try before you spend',
    body: 'Read the first 10% of any book free. Then unlock it with credits, all at once or chapter by chapter as you read.',
  },
];

const plans = [
  {
    name: 'Monthly',
    price: '₦900',
    per: 'every month',
    credits: '300',
    books: '2',
    perMonth: '₦900',
  },
  {
    name: 'Quarterly',
    badge: 'Most popular',
    price: '₦2,400',
    per: 'every 3 months',
    credits: '800',
    books: '6',
    perMonth: '₦800',
  },
  {
    name: 'Yearly',
    badge: 'Best value',
    price: '₦8,400',
    per: 'once a year',
    credits: '3,000',
    note: 'includes 200 bonus',
    books: '24',
    perMonth: '₦700',
  },
];

const community = [
  {
    title: 'Book clubs',
    body: 'Join a church, campus or friends club, keep pace with the chapter thread, and chat as you read.',
  },
  {
    title: 'Reading rooms',
    body: 'Start a room for a book, share the code on WhatsApp, and read together from the first page.',
  },
  {
    title: 'Highlights and threads',
    body: 'Highlight a line, drop it in your club, and talk about the exact paragraph that got you.',
  },
  {
    title: 'Authors, up close',
    body: 'Authors are members too. Follow them, join the room around their book, and message them.',
  },
];

const faqs = [
  {
    q: 'What is Arpedia?',
    a: 'A reading community. You get a library of Christian novels, clean books, and African stories, and the readers, authors, and book clubs that gather around them, all in one app.',
  },
  {
    q: 'How do I get the app?',
    a: stores.appStore
      ? 'Arpedia is on Google Play for Android and on the App Store for iPhone. Use the buttons on this page.'
      : 'Arpedia is on Google Play for Android. The iPhone app is coming, and this page will have the App Store button when it is ready.',
  },
  {
    q: 'What does a plan include?',
    a: 'Reading credits every time your plan renews, a free preview of the first 10% of every book, and the whole community: clubs, rooms, notes, and the authors themselves. Credits are what you spend to unlock books.',
  },
  {
    q: 'How much does a book cost?',
    a: 'Half a credit for every standard page of 250 words, rounded up. A 250-page book is 125 credits, which is ₦375 at ₦3 a credit. You see the price before you unlock, and you can pay as you read, one chapter at a time.',
  },
  {
    q: 'What happens to my credits and books if I stop?',
    a: 'Books you unlock stay in your library for good. Unused plan credits roll over for one period, up to one plan’s worth. You can also pause for 1 to 3 months before you cancel, and your credits are kept.',
  },
  {
    q: 'Can I really talk to the authors?',
    a: 'Yes. Authors are members here too. Follow them, join the room around their book, and ask your question where the chapter is being discussed.',
  },
  {
    q: 'Can authors publish on Arpedia?',
    a: 'Yes. Apply in the Arpedia app, then upload your manuscript and cover as EPUB, Word or PDF. Every book is checked before it goes live. You earn ₦1.60 for every credit readers spend on your book, paid monthly.',
  },
];

export default function Home() {
  return (
    <Page>
      {/* Hero */}
      <section className="hero petals">
        <div className="wrap hero__in">
          <div className="hero__copy">
            <p className="eyebrow rise">Community at the heart of African stories</p>
            <h1 className="h-display rise" style={{ '--i': 1 } as React.CSSProperties}>
              Never read a book alone again.
            </h1>
            <p className="lede rise" style={{ '--i': 2 } as React.CSSProperties}>
              Subscribe, get credits, and unlock Christian novels, clean books, and African stories, in the
              same room as the readers, the clubs, and the authors behind them.
            </p>
            <div className="hero__cta rise" style={{ '--i': 3 } as React.CSSProperties}>
              <StoreBadges />
              <a className="btn btn-n" href="#credits">
                See how credits work
              </a>
            </div>
          </div>
          <div className="hero__art rise" style={{ '--i': 2 } as React.CSSProperties}>
            <img
              className="hero__photo"
              src="/img/reading.jpg"
              alt="A reader on a sofa by a bright window, holding an open book"
              width={900}
              height={900}
              fetchPriority="high"
            />
            <span className="pill night float float--credits">800 credits this quarter</span>
            <div className="float float--quote">
              <small>Book room</small>
              <strong>“Nobody move, the author just joined.”</strong>
            </div>
          </div>
        </div>
      </section>

      {/* What Arpedia is */}
      <section className="section wrap" id="about" aria-labelledby="about-h">
        <div className="section__head">
          <p className="eyebrow">Why Arpedia</p>
          <h2 className="h-section" id="about-h">
            A book is where the conversation starts, not where it ends.
          </h2>
          <p className="lede">Most reading apps hand you a file and leave.</p>
        </div>
        <div className="why">
          {why.map((w, i) => (
            <article className="why__item" key={w.title}>
              <span className="why__n" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3>{w.title}</h3>
                <p>{w.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* For readers */}
      <section className="section wrap" id="readers" aria-labelledby="readers-h">
        <div className="split">
          <img
            className="split__img"
            src="/img/shelf.jpg"
            alt="Shelves full of books"
            width={1000}
            height={900}
            loading="lazy"
          />
          <div>
            <div className="section__head">
              <p className="eyebrow">For readers</p>
              <h2 className="h-section" id="readers-h">
                Read a free taste first. Pay only for what you keep.
              </h2>
            </div>
            <ul className="facts">
              <li>
                <b>10% free on every book</b>
                <span>Read the start of any book before you spend a single credit.</span>
              </li>
              <li>
                <b>Unlock it all, or pay as you read</b>
                <span>
                  Pay as you read takes a chapter&apos;s credits only when you move past its first page.
                  Changed your mind? Undo within 10 minutes. Re-reading is free.
                </span>
              </li>
              <li>
                <b>Unlocked books stay yours</b>
                <span>They stay in your library for good, even if you cancel your plan.</span>
              </li>
              <li>
                <b>Read on a real phone</b>
                <span>
                  Built for Android phones on mobile data, with books you can download and read offline.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Credits */}
      <section className="band-night" id="credits" aria-labelledby="credits-h">
        <div className="wrap">
          <div className="section__head">
            <p className="eyebrow">How credits work</p>
            <h2 className="h-section" id="credits-h">
              Credits, in plain naira.
            </h2>
            <p className="lede">
              Your plan gives you credits every time it renews. You spend credits to unlock books. One credit
              is worth the same on every plan.
            </p>
          </div>

          <div className="big3">
            <div>
              <b>₦3</b>
              <span>is what one credit is worth, on every plan and every top-up.</span>
            </div>
            <div>
              <b>½</b>
              <span>a credit for each 250-word page of a book, rounded up.</span>
            </div>
            <div>
              <b>125</b>
              <span>credits (₦375) for a 250-page book. Authors earn ₦200 from it.</span>
            </div>
          </div>

          <div className="plans">
            {plans.map((p) => (
              <article className={`plan${p.badge === 'Most popular' ? ' plan--pop' : ''}`} key={p.name}>
                <h3>
                  {p.name}
                  {p.badge ? <span className="pill">{p.badge}</span> : null}
                </h3>
                <p className="plan__price">
                  {p.price} <small>{p.per}</small>
                </p>
                <dl>
                  <div>
                    <dt>Credits</dt>
                    <dd>{p.credits}</dd>
                  </div>
                  {p.note ? (
                    <div>
                      <dt>Bonus</dt>
                      <dd>200 included</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>About</dt>
                    <dd>{p.books} books</dd>
                  </div>
                  <div>
                    <dt>Works out at</dt>
                    <dd>{p.perMonth} a month</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          <div className="topups">
            <h3>Need more? Top up.</h3>
            <p className="lede">
              Top-ups are for subscribers, at ₦3 a credit. They never expire while your account is open.
            </p>
            <ul>
              <li>200 credits for ₦600</li>
              <li>500 credits for ₦1,500</li>
              <li>1,000 credits for ₦3,000</li>
            </ul>
          </div>

          <p className="fine">
            Prices are the in-app prices, billed by Google Play and renewed until you cancel. Book counts are
            approximate, using a 125-credit book. Unused plan credits roll over for one period, up to one
            plan&apos;s worth. You can pause for 1 to 3 months before you cancel, and your credits are kept.
            See the <a href="/legal/refunds">refund policy</a>.
          </p>
        </div>
      </section>

      {/* Authors */}
      <section className="section wrap" id="authors" aria-labelledby="authors-h">
        <div className="section__head">
          <p className="eyebrow">For authors</p>
          <h2 className="h-section" id="authors-h">
            Publish your book. Then meet the people reading it.
          </h2>
        </div>
        <ol className="steps">
          <li>
            <div>
              <strong>Bring your book and cover.</strong>
              <span>Apply in the app and upload your manuscript as EPUB, Word or PDF.</span>
            </div>
          </li>
          <li>
            <div>
              <strong>We check it and publish it for readers.</strong>
              <span>Every book is checked before it goes live.</span>
            </div>
          </li>
          <li>
            <div>
              <strong>Meet the people reading you.</strong>
              <span>In rooms, notes, and replies.</span>
            </div>
          </li>
        </ol>
        <div className="earn">
          <b>₦1.60</b>
          <span>
            for every credit readers spend on your book, paid monthly. A 125-credit book pays you ₦200 each
            time a reader unlocks it in full. <a href="/legal/author-agreement">Read the Author Agreement</a>.
          </span>
        </div>
      </section>

      {/* Community */}
      <section className="section wrap" id="community" aria-labelledby="community-h">
        <div className="section__head">
          <p className="eyebrow">Community</p>
          <h2 className="h-section" id="community-h">
            A community that grows around every story.
          </h2>
        </div>
        <div className="community">
          {community.map((c) => (
            <article key={c.title}>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </article>
          ))}
          <div className="voice petals">
            <small>Our promise</small>
            <strong>Nobody reads alone on Arpedia.</strong>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section wrap" id="faq" aria-labelledby="faq-h">
        <div className="section__head">
          <p className="eyebrow">Questions</p>
          <h2 className="h-section" id="faq-h">
            The simple version before you join.
          </h2>
        </div>
        <div className="faq">
          {faqs.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Download */}
      <section className="download petals" id="download" aria-labelledby="download-h">
        <div className="wrap download__in">
          <h2 className="h-section" id="download-h">
            There is a room waiting for your next book.
          </h2>
          <p>Get Arpedia, read the first 10% of any book free, and find your people.</p>
          <StoreBadges />
        </div>
      </section>
    </Page>
  );
}
