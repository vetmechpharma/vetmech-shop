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

## Backlog (P1/P2)
- P1: Real WhatsApp API + SMTP wiring (plug credentials in Admin), pincode auto state/district lookup.
- P2: Structured data (JSON-LD) on product/article, image WebP optimization pipeline, granular per-admin custom permissions UI, order edit (add/remove products) UI in admin.

## Credentials
- Admin: vetmechpharma@gmail.com / Admin@123 (see /app/memory/test_credentials.md)
