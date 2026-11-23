import { Hono, type Context } from 'hono';
import { safeEqual, type RevenueCatEvent } from '@arpedia/core';
import { serviceDb } from '../../db';
import type { AppEnv, Env } from '../../env';

// Flow 17 rule 4 · store events for products the new app doesn't sell.
// The RevenueCat project is shared with v25, so a v25 purchase, renewal or Restore still arrives
// at POST /v1/payments/revenuecat. This guard runs before the flow 09 handler: an event whose
// product id is not one of our plans or credit packs grants nothing, is recorded once for Finance
// (`log_unmatched_store_event`) and answers 200 so RevenueCat doesn't retry it. Everything else
// passes through to flow 09 unchanged.

type Db = ReturnType<typeof serviceDb>;

/** The product an event is about when it is not one we sell, or null to let flow 09 apply it. */
export function unmatchedProduct(event: RevenueCatEvent | undefined, known: ReadonlySet<string>): string | null {
  if (!event?.id || !event.type || event.type === 'TEST') return null;
  const product = event.product_id?.trim();
  if (!product) return null;
  return known.has(product) ? null : product;
}

/** Every Play product id we sell, active or not (an old plan's renewals still apply). */
export async function knownProducts(db: Db): Promise<Set<string>> {
  const [plans, packs] = await Promise.all([
    db.from('plans').select('play_product_id'),
    db.from('topup_products').select('play_product_id'),
  ]);
  if (plans.error || packs.error) throw new Error(`known products: ${(plans.error ?? packs.error)!.message}`);
  return new Set([...plans.data, ...packs.data].map((r) => r.play_product_id));
}

export function storeEventsRouter(getDb: (env: Env) => Db = serviceDb) {
  const router = new Hono<AppEnv>();
  router.use('/revenuecat', async (c: Context<AppEnv>, next) => {
    const secret = c.env.REVENUECAT_WEBHOOK_AUTH;
    // Unauthenticated or unconfigured requests are flow 09's to refuse.
    if (!secret || !safeEqual(c.req.header('Authorization') ?? '', secret)) return next();
    const body = await c.req.json<{ event?: RevenueCatEvent }>().catch(() => null);
    const db = getDb(c.env);
    const product = body ? unmatchedProduct(body.event, await knownProducts(db)) : null;
    if (!product || !body?.event) return next();
    const e = body.event;
    const { data: logged, error } = await db.rpc('log_unmatched_store_event', {
      p_provider: 'revenuecat',
      p_event_id: e.id,
      p_product_id: product,
      p_app_user_id: e.app_user_id ?? e.original_app_user_id ?? '',
    });
    if (error) throw new Error(`log_unmatched_store_event: ${error.message}`);
    if (logged) console.log('[unmatched_store_event]', product, e.type);
    return c.json({ ok: true, unmatched: true, duplicate: !logged });
  });
  return router;
}

export default storeEventsRouter();
