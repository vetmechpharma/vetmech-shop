# VETMECH Pharmaceuticals — B2B Ordering Platform (PRD)

## Original Problem
Modern, professional, responsive veterinary pharmaceutical corporate website + B2B product ordering platform for VETMECH PHARMACEUTICALS PRIVATE LIMITED. NO online payment — orders submitted on site and confirmed via WhatsApp. Public site + product catalog + B2B cart + WhatsApp OTP checkout + customer accounts + powerful Admin Panel with full CMS/SEO/scheme/order control.

## Architecture
- **Backend**: FastAPI (modular routers: auth, catalog, orders, cms, admin) + MongoDB (motor). JWT Bearer auth. Files served from /api/uploads.
- **Frontend**: React 19 + Tailwind + shadcn/ui + react-query + recharts. Public site + isolated Admin Panel.
- **Auth**: Admin = email/password JWT (bcrypt). Customer = mobile + WhatsApp OTP (MOCKED — dev_otp returned in API response).
- **Integrations (all MOCKED/simulated, configurable in Admin)**: WhatsApp OTP + order/status notifications, SMTP email. Logged to db.notification_logs.

## User Personas
- Customers: Doctors, Agencies, Medical Shops, Distributors, Farms (B2B bulk ordering, reorder).
- Admins: Super Admin + role-based (Product/Order/Content/Sales Manager).

## Implemented (2026-06)
- Public site: Home (editable sections), Products listing + filters/search, Product detail (variants, conditional sections, badges, related, brochure), Category pages, B2B Cart (Ordered/Free/Dispatch/Scheme), Checkout with WhatsApp OTP + Indian address, Order confirmation, Customer account (orders, one-click reorder, addresses), corporate/CMS pages (About/Quality/Infra/R&D/Privacy/Terms), News list+article, Gallery, Careers+apply, Contact form. Mobile bottom nav.
- Scheme engine: free-qty (10+5) and special-price schemes, auto-applied by qty, recalculated on reorder.
- Admin Panel: Dashboard (charts/stats), Products (variants/badges/images/SEO/related), Categories, Brands, Units, Schemes, Orders (status workflow + activity log + edit + CSV/Excel/PDF export), Customers (history/frequent products), Website Pages, News, Gallery, Careers, Applications, Enquiries, Notification log, WhatsApp/SMTP/SEO/Company/Homepage/Website settings, Admin Users (RBAC), Audit Logs.
- SEO: per-page dynamic meta/OG, product slugs, /api/sitemap.xml, /api/robots.txt.
- Seed data: admin + 4 demo products + 3 schemes + categories + pages + news + gallery + careers (marked is_demo).

## Verified
- 31/31 backend tests pass; full E2E purchase + admin flows pass (iteration_1.json).

## Implemented — Customer Support / Ticketing (2026-06)
- New admin module under /admin/support/*: Support Dashboard (KPIs + charts), CRM Customers (profiles, stats, quick call/WhatsApp/email), Tickets (statuses Open/In Progress/Pending/Closed + auto-derived Overdue, priorities, types, assignee, due dates), Ticket detail (status control, updates/comments, attachments, activity timeline), Create Ticket, My Tasks, Calendar (month grid), Reports (employee/customer/type + CSV/Excel/PDF export), Ticket Settings (types/priorities/notification channels), in-app Notification bell.
- Roles extended: admin, manager, sales_executive, support_user (module "tickets"). Seeded 5 staff, 8 CRM customers, 22 demo tickets.
- Backend: /app/backend/routers/tickets.py (+ seed_tickets.py). Overdue derived (not stored). Notifications in db.ticket_notifications (external WhatsApp/Email/SMS MOCKED).
- Verified: 26/26 backend tests + full frontend flows pass (iteration_2.json). Fixed api.js token routing for /tickets & /crm paths.

## Implemented — Feature Batch 3 (2026-06)
- Variant CASE quantity (units_per_case) + "buy 1 full case" helper on product page; case shown in cart.
- Homepage Featured Products selector in admin (featured_product_ids); Home uses selection, falls back to FEATURED badge.
- Uploaded images auto-converted to compressed WebP (max 1600px, q80) via Pillow.
- Backup & Restore in admin (super admin): database JSON export, images ZIP export, storage stats.
- Admin Support dashboard redesigned with colored gradient KPI cards; website header/branding polish.
- Verified: 15/15 backend + 100% frontend (iteration_3.json). Admin login bug reported earlier not reproducible; hardened login clears stale token.

## Implemented — Quotation Management Module (2026-06)
- New admin module under /admin/quotations/*: Dashboard (KPI cards + status counts + top customers), All Quotations list (search/status filter), Create/Edit form (searchable customer picker, add DB catalog products + MANUAL free-text items with optional "save to catalog", per-line qty/rate/discount %/₹/GST, live totals), Detail view (customer/company snapshot, items, terms, summary + amount-in-words, history timeline), Quotation Settings (number prefix/digits/start, default validity, default terms).
- SNAPSHOT integrity: each quote stores company_snapshot, customer, terms, signatory (name/designation/signature) and per-item name/price at creation time — master-data changes do not alter existing quotes.
- A4 PDF generated on backend via reportlab (green branded header, itemized table, summary, terms, signatory block, repeating footer w/ page numbers, amount-in-words via num2words).
- Actions: PATCH status, Send via Email/WhatsApp (MOCKED), Duplicate, Convert-to-Order (creates order, sets quote accepted + converted_order), Delete (draft-only unless super_admin).
- Signatory: Admin Users edit form now has Designation, Signature image upload, and "use signature on quotations" toggle.
- Backend: /app/backend/routers/quotations.py (prefix /api/admin/quotations), mediahelper.py (signature fetch for PDF); wired in server.py; "quotations" module added to RBAC (super_admin, order_manager, sales_manager, admin).
- Verified: 15/15 backend pytest + 100% frontend flows pass (iteration_5.json); PDF visually verified.

## Implemented — User-Wise Pricing & Offer Management Module (2026-06)
Built in 4 tested phases. Extends the existing scheme engine + adds a pricing layer.

**Phase 1 — Accounts & Auth** (iteration_6.json, 19/19 backend + frontend pass)
- Customer self-registration (/register, all fields) with admin-approval workflow (pending→active→suspended/rejected/deleted); existing customers grandfathered to active.
- Duplicate-mobile prevention via normalized Indian mobile (helpers.normalize_mobile); enforced on registration + admin manual create + edit.
- Dual login: Mobile+OTP and Mobile+Password (bcrypt), admin-toggleable; OTP expiry + attempt limit + request rate limit; password login lockout (5 fails/15min); suspended/rejected/deleted blocked.
- Admin Customers overhaul: status tabs, approve/reject/suspend/reactivate/delete/reset-password/change-category, manual Add Customer, pending count on dashboard.
- Admin → Pricing Engine settings (/admin/pricing-settings): all toggles + price_change_behavior.

**Phase 2 — Pricing Engine Core** (iteration_7.json, 21/21 backend + frontend pass)
- /app/backend/pricing_engine.py: resolve_pricing() + price_line(). Priority rate: customer-specific(manual/last_confirmed) > category > public > MRP. Offer: customer > category > public, NO stacking (pick_offer_schemes).
- Per-variant category_prices + per-customer customer_prices collections. Server-side cart/checkout pricing (never trusts frontend). Guests/pending get PUBLIC pricing.
- SECURITY: storefront (enrich_products) returns only the logged-in customer's your_price/price_source — never other categories' rates.
- Admin Pricing Manager (/admin/pricing-manager): Category tab (per-variant×category rate matrix) + Customer tab (add/edit/delete/protect customer-specific price + offer).
- Storefront: ProductDetail/ProductCard show "YOUR PRICE"/offer for logged-in active customers + "Login to view your special price" (AuthDialog OTP/Password) for guests.

**Phase 3 — Orders, Category Change & Quotation Integration** (iteration_8.json, 16/16 backend + frontend pass)
- Admin order edit with per-line manual rate/offer override (price_source 'manual_admin') + "Update Customer Pricing = Yes/No" → writes last-confirmed pricing (customer_prices source last_confirmed, preserves protected flag). Old orders never change (snapshots).
- Category price change as MASTER change: /category-change/preview lists affected customers (old→new + protected), /category-change/apply with mode keep_protected|reset_all|keep_all. Price protection respected (cp.protected OR customer.price_protected).
- Quotation convert-to-order optional update_customer_pricing.
- pricing_audit collection logs category + customer + last-confirmed price changes.
- Backend: /app/backend/routers/pricing.py (prefix /api/admin/pricing), pricing_engine.py; catalog.enrich_products + orders.resolve_cart refactored to full pricing engine.

## Enhanced — Variant Offers merge + Best-Value + Upsell (2026-06)
- Category-wise **rate + multiple offers per variant** managed inline from Pricing Manager → Category tab → per-variant **Offers** button (shared `schemes` data). Standalone "Schemes & Offers" nav link removed (route still exists, unlinked).
- A variant supports different rate AND different offers per category (Doctor ₹170 10+3, Agency ₹140 10+1, etc.) and multiple offers per category (10+3, 20+6, 60+22).
- **Best-value offer selection**: `compute_scheme` now picks the offer giving the MOST free units (no stacking). Special/case price tracked separately (label/id consistency fixed).
- **Upsell nudges** (`pricing_engine.compute_upsell` + `case_suggestion`): "Add N more to reach X and get Y free" on ProductDetail (near qty, with Apply) + cart line; full-case suggestion when cheaper per unit.
- Offers CRUD: GET/POST/DELETE `/api/admin/pricing/offers` (validates customer_type, 404 on unknown delete).
- Verified: 14/14 backend pytest (/app/backend/tests/test_offers_upsell.py) + frontend flows (iteration_9.json).

## Pre-login pricing lock (2026-06)
- Non-logged-in ("universal") customers now see MRP only — `enrich_products` nulls selling_price, clears offers, sets `login_required` for guest requests. After login, applicable price + offers show. Verified via curl (guest MRP-only vs doctor price+offers).

## Requested backlog — sequenced (from user, pending build)
1. **Order & Dispatch Management module** (largest — full PRD): status flow New→Confirmed→Processing→Prepare-for-Dispatch→Dispatched→Delivered (+On Hold/Cancelled); dispatch dashboard w/ status counts + search/filters; Prepare-for-Dispatch (no. of cases, transport, freight To Pay/Paid, LR/tracking, dispatch date); dispatch checklist gate; Confirm Dispatch; editable WhatsApp dispatch message + status message templates; order history timeline; Dispatch List page w/ export; Transport Master (Settings). Build modular for future partial/return shipments.
2. **Envelope printing** (10×4.5in) — integrate the provided HTML layout, auto-populate recipient from order (name/address/city/district/state/pin/mobile/order no); "PRINT ENVELOPE" button inside Prepare-for-Dispatch.
3. **Single-window Quick Order page** — all products + their offers in one scrollable list, add qty inline without opening each product.
4. **Shop filter sidebar** — accordion category/brand/availability rail.
5. **Split-screen Auth** — image on one side for login/register.
6. **Merge Price Manager into the Product/variant editor** — set category rates + offers while adding a product.
- (Done) Pre-login MRP-only pricing.

## Backlog (P1/P2)
- P1: Real WhatsApp API + SMTP wiring (plug credentials in Admin), pincode auto state/district lookup.
- P2: Structured data (JSON-LD) on product/article, image WebP optimization pipeline, granular per-admin custom permissions UI, order edit (add/remove products) UI in admin.

## Credentials
- Admin: vetmechpharma@gmail.com / Admin@123 (see /app/memory/test_credentials.md)
