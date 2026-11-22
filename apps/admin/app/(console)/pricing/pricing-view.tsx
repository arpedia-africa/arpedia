import Link from 'next/link';
import { aboutBooks, naira } from '@arpedia/core';
import { loadPricing } from './data';
import { FlashToast } from './flash';
import { dayLabel, describeChange, nairaDec, num } from './format';

/** s-pricing: plans, top-ups, what a book costs under the rules, and the price history. */
export async function PricingBody({ flash }: { flash?: string | null }) {
  const { plans, topups, avgBook, rules, ruleVersions, planVersions } = await loadPricing();
  if (!rules) throw new Error('No pricing rules found');
  const perPage = rules.credits_per_page;
  const creditValue = rules.credit_value_kobo;
  const bonusPlans = plans.filter(p => p.bonus_credits > 0);
  const now = new Date().toISOString();

  const history = [
    ...planVersions.map(v => ({
      at: v.effective_from,
      title: `${v.name} ${naira(v.price_web_kobo)} for ${num(v.credits + v.bonus_credits)} credits`,
      small: [dayLabel(v.effective_from), v.note, v.by].filter(Boolean).join(' · '),
    })),
    ...ruleVersions.map((v, i) => ({
      at: v.effective_at,
      title: describeChange(ruleVersions[i + 1]?.rules ?? null, v.rules).slice(0, 2).join(', ') || 'Pricing rules saved',
      small: [dayLabel(v.effective_at), v.note, v.by].filter(Boolean).join(' · '),
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Plans and pricing</h1>
          </div>
          <div className="band__acts">
            <Link className="btn btn-n" href="/pricing-rules">
              Pricing rules
            </Link>
            <Link className="btn btn-g" href="/promos">
              Promo codes
            </Link>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="note warn">
          <div className="grow">
            In-app prices are set in Google Play Console and App Store Connect, not here. Web prices change immediately.
          </div>
        </div>
        <div className="panel panel--flush">
          <div className="panel__head">
            <h2>Plans</h2>
            <span className="sub">Credits refill on the renewal date</span>
          </div>
          {plans.length === 0 ? (
            <div className="empty" style={{ padding: '64px 24px' }}>
              <b>No plans yet</b>
              <span>Plans show here once they are set up in the database.</span>
            </div>
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th className="r">In-app price</th>
                    <th className="r">Web price</th>
                    <th className="r">Credits</th>
                    <th className="r">About</th>
                    <th className="acts"></th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map(p => {
                    const books = aboutBooks(p.total_credits, avgBook);
                    return (
                      <tr key={p.code}>
                        <td>
                          <div className="who">
                            <span>
                              <b>{p.name}</b>
                              {p.badge && (
                                <>
                                  {' '}
                                  <span className={`tag${p.code === 'quarterly' ? ' org' : ''}`}>{p.badge}</span>
                                </>
                              )}
                              <small className="mn-id">
                                {p.months > 1
                                  ? `${p.play_product_id} · ${naira(Math.round(p.price_play_kobo / p.months))} a month`
                                  : p.play_product_id}
                              </small>
                            </span>
                          </div>
                        </td>
                        <td className="n">{naira(p.price_play_kobo)}</td>
                        <td className="n">{naira(p.price_web_kobo)}</td>
                        <td className="n">{num(p.total_credits)}</td>
                        <td className="n">{`${books} book${books === 1 ? '' : 's'}`}</td>
                        <td className="acts">
                          <Link className="btn btn-g sm" href={`/pricing/${p.code}`}>
                            Edit
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="panel__foot">
            {bonusPlans.length > 0 &&
              `${bonusPlans.map(p => `${p.name} includes ${num(p.bonus_credits)} bonus credits`).join('. ')}. `}
            {`“About” assumes a 250-page book at ${num(avgBook)} credits.`}
          </div>
        </div>
        <div className="mn-two">
          <div className="panel panel--flush">
            <div className="panel__head">
              <h2>Top-ups</h2>
              <span className="sub">Subscribers only</span>
            </div>
            {topups.length === 0 ? (
              <div className="empty" style={{ padding: '40px 24px' }}>
                <b>No top-ups</b>
                <span>Top-up products show here once they are set up.</span>
              </div>
            ) : (
              <div className="tw">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Top-up</th>
                      <th className="r">Price</th>
                      <th className="r">Per credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topups.map(t => (
                      <tr key={t.code}>
                        <td>
                          <div className="who">
                            <span>
                              <b>{`${num(t.credits)} credits`}</b>
                              <small className="mn-id">{t.play_product_id}</small>
                            </span>
                          </div>
                        </td>
                        <td className="n">{naira(t.price_kobo)}</td>
                        <td className="n">{nairaDec(t.price_kobo / t.credits)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="panel__foot">
              <span className="grow">Top-up credits never expire while the account is open.</span>
            </div>
          </div>
          <div className="panel panel--flush">
            <div className="panel__head">
              <h2>Book prices</h2>
              <span className="sub">{`${perPage === 0.5 ? '½' : perPage} credit per standard page · ${nairaDec(perPage * creditValue)} a page`}</span>
            </div>
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Book length</th>
                    <th className="r">Credits</th>
                    <th className="r">Reader pays</th>
                    <th className="r">Author earns</th>
                  </tr>
                </thead>
                <tbody>
                  {[150, 250, 350, 600].map(pages => {
                    const credits = Math.max(Math.ceil(pages * perPage), 1);
                    return (
                      <tr key={pages}>
                        <td>{`${pages} pages · ${num(pages * rules.words_per_page)} words`}</td>
                        <td className="n">{num(credits)}</td>
                        <td className="n">{naira(credits * creditValue)}</td>
                        <td className="n">{naira(credits * rules.author_rate_kobo)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="panel__foot">
              <span className="grow">Upfront or pay as you read: same total.</span>
              <Link className="btn btn-g sm" href="/pricing-rules">
                Edit pricing rules
              </Link>
            </div>
          </div>
        </div>
        <details className="fold">
          <summary>
            More details <small>other prices, price history</small>
          </summary>
          <div className="fold__b">
            <dl className="kv">
              <dt>Free preview</dt>
              <dd>{`First ${rules.preview_pct}% of every book`}</dd>
              <dt>Author rate</dt>
              <dd>{`The author earns ${nairaDec(rules.author_rate_kobo)} per credit spent.`}</dd>
              <dt>Rollover</dt>
              <dd>
                {`Unused plan credits carry over one period while subscribed, up to ${rules.rollover_cap_plans === 1 ? 'one plan’s' : `${rules.rollover_cap_plans} plans’`} worth`}
              </dd>
              <dt>Pause</dt>
              <dd>{`1 to ${rules.pause_max_months} months instead of cancelling. Credits and rollover are kept while paused.`}</dd>
              <dt>Rounding</dt>
              <dd>{`Prices in whole naira, book prices rounded up to a whole credit, ${naira(creditValue)} per credit.`}</dd>
            </dl>
            <span className="mn-fold-h">Price change history</span>
            {history.length === 0 ? (
              <span className="muted">Price changes show here.</span>
            ) : (
              <div className="tl">
                {history.map((h, i) => (
                  <div key={i} className={`tl__i ${h.at > now ? 'org' : 'ok'}`}>
                    <b>{h.title}</b>
                    <small>{h.small}</small>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
      </div>
      <FlashToast message={flash ?? null} clearHref="/pricing" />
    </section>
  );
}
