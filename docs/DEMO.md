# Browser development demo

Public demo: https://vetmech-shop-dev-demo.vetmechpharma.chatgpt.site

Anyone with the link can open the hosted demo without a ChatGPT account. This
audience is configured in the demo host's access settings. The source and VPS
build have no ChatGPT sign-in requirement; production admin and customer logins
use the application's own authentication.

The demo uses the existing React storefront and admin screens with an optional
client-side sample API. It does not run or replace the Python/MongoDB backend.
The normal production build keeps the real API path and does not install the
demo adapter or display the demo toolbar.

```bash
cd frontend
npm ci
npm run test:demo
npm run build:demo
```

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

The demo build and isolated sample-flow tests were verified. Interactive browser
QA could not run because the managed browser-control capability was unavailable.
