# @arpedia/web

The public website for arpedia.africa: home page, legal pages, support, and the share landing pages the app links to. Next.js App Router, plain CSS from the app's design tokens (`DESIGN.md`), no component library, no secrets.

## Run it

```
pnpm i
pnpm --filter @arpedia/web dev      # http://localhost:3100
pnpm --filter @arpedia/web build && pnpm --filter @arpedia/web start
pnpm --filter @arpedia/web test
```

Copy `.env.example` to `.env.local` to set the values below. Only `NEXT_PUBLIC_*` values are used.

| Variable                    | What it does                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`      | Canonical address for links, Open Graph and the sitemap. Default `https://arpedia.africa`.                        |
| `NEXT_PUBLIC_API_URL`       | api Worker base URL. `/legal/<slug>` reads the published policy from `<url>/legal/<slug>`. Empty = bundled text. |
| `NEXT_PUBLIC_APP_STORE_URL` | App Store listing. The badge shows only when this is set.                                                         |

## Routes

- `/` home. `/support`. `/account` (the app opens it for web subscribers). `/payment-complete` (Flutterwave redirect).
- `/legal`, `/legal/<slug>` for `terms`, `privacy`, `community-guidelines`, `copyright`, `author-agreement`, `refunds`, `delete-account`. Refreshed about hourly from the api Worker's published text; the bundled text (`lib/legal-content.tsx`) shows when the Worker is down, not configured, or only has the one-line placeholder. The Delete-account page always shows the in-app steps and an email request.
- Redirects: `/privacy`, `/terms`, `/copyright`, `/delete-account` to `/legal/...`; `/help` to `/support`; `/legal/refund` to `/legal/refunds` (`lib/redirects.ts`).
- Share links: `/c/<id>`, `/r/<code>`, `/book/<slug>`, `/author/<name>`, `/community/<slug>`. They show "Open in the app" and the store badges, with Open Graph tags, and use no server data.
- `/.well-known/assetlinks.json` (Android) and `/.well-known/apple-app-site-association` (iOS), served as JSON.

## Deploy on Vercel (owner steps)

1. In Vercel, import the repository as a new project. Root directory `apps/web`, framework Next.js. Leave "Include files outside the root directory" on (the lockfile is at the repo root). Install command `pnpm install`, build command `pnpm build`.
2. Add the environment variables above. Production: `NEXT_PUBLIC_API_URL=https://api.arpedia.africa`.
3. Check the preview deployment: `/`, `/legal/delete-account`, `/r/ABC123`, and `/.well-known/assetlinks.json`.
4. Move `arpedia.africa` and `www.arpedia.africa` to this project (Settings, Domains). The domain already points at Vercel. Do not add a Cloudflare Worker route for `arpedia.africa/legal*`: it would take the path away from this site.
5. Check the live site, then in Google Play Console confirm the privacy policy and account deletion URLs (`docs/launch/STORE-CHECKLIST.md`).

Universal and App Links also need the app to declare the domain (Android intent filters, iOS associated domains) in `apps/mobile/app.json`. That is not part of this site.
