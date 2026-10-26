# Browser development demo

Public demo: https://vetmech-shop-dev-demo.vetmechpharma.chatgpt.site

Anyone with the link can open the hosted demo without a ChatGPT account. This
audience is configured in the demo host's access settings. The source and VPS
build have no ChatGPT sign-in requirement; production admin and customer logins
use the application's own authentication.

The preview now includes the black-and-red corporate website, price-free public
portfolio and separate Partner Shop at `/shop`. Demo tools open the sample
customer directly in the Shop. See [corporate design](CORPORATE_DESIGN.md).

The demo uses the React website and admin screens with an optional
client-side sample API. It does not run or replace the Python/MongoDB backend.
The normal production build keeps the real API path and does not install the
demo adapter or display the demo toolbar.

```bash
cd frontend
npm ci
npm run test:demo
npm run build:demo
```

For a hosted demo, build with its actual public origin so WhatsApp and other
social crawlers receive the product name, description and absolute image URL
without running JavaScript:

```bash
npm run build:demo -- --site-url https://vetmech-shop-dev-demo.vetmechpharma.chatgpt.site
```

The demo build writes initial HTML for both `/products/:slug` and
`/shop/products/:slug` from the shipped sample catalogue. These pages and the
demo fallback remain `noindex, nofollow`. Browser-local product edits are not
published to crawlers; update the seed and rebuild to change a shared preview.
QUINOTAZ uses a local JPEG copy of its published social image. The production
VPS continues to use its existing backend crawler rendering for live records.

Use the top **Demo tools** menu for one-click admin, doctor and agency entry,
local sample-data export and reset. The optional sample admin login is
`demo@vetmech.local` / `Demo@123`; the sample OTP is `123456`.

Sample products, customers, approvals, category/customer prices, offers, orders,
dispatches, quotations, CRM tickets, CMS and reports can be explored. Data lives
in browser localStorage under a separate demo key. Notifications are always
simulated, even when sample integration settings are edited. Exported demo data
has a distinct format and is not a production database backup.

Implementation: `frontend/src/demo/seed.mjs`, `engine.mjs`, `adapter.js`,
`DemoToolbar.jsx`, `demo.css`; local SVG artwork is in `frontend/public/demo/`.
Authoritative production business rules remain in the Python backend.

The current redesign is verified with isolated data/price-projection tests, the
production and demo builds, and browser checks of the public portfolio and Shop.
