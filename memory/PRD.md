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

## Requested backlog — sequenced (from user)
1. **(DONE 2026-06) Order & Dispatch + Envelope + Transport Master**: dispatch endpoint POST /api/admin/orders/{id}/dispatch (cases/transport/freight/LR/date/remarks, validation, records dispatched_by, WhatsApp notify), Transport Master CRUD (/api/admin/transports), on_hold status. Frontend: DispatchSection in order detail (Prepare-for-Dispatch form + checklist gate + Print Envelope + Confirm Dispatch + dispatched summary + reprint), AdminTransports page, envelope util (/lib/envelope.js, 10x4.5in auto-filled from order + auto-print). Order history timeline via activity log. Verified curl + screenshots.
   - Remaining sub-items (P1): dedicated Dispatch List page w/ export, editable message-template settings, dispatch-status filters on orders dashboard.
2. **(DONE 2026-06) Quick Order page** — /quick-order: single scrollable list of all product variants with image, MRP/your-price, offer, inline qty stepper + Add; guest sees MRP-only + login banner; nav links added (desktop + mobile). Verified via screenshot (add → cart updates).
3. **(DONE 2026-06) Shop filter sidebar** — accordion Category/Brand/Availability rail on /products (sticky desktop + mobile Sheet), category filter added (slug). Verified via screenshot.
4. **(DONE 2026-06) Split-screen Auth** — Account login AND Register now use a premium image-left / form-right layout with benefits list. Verified via screenshot.
5. **(DONE 2026-06) Merge Price Manager into Product/variant editor** — new "Pricing & Offers" tab in the product dialog: per-variant category rates (6 categories) + offers (Buy X Get Y Free / Special Price / Case Price), saved together with the product (PUT /api/admin/pricing/product/{id} + POST/DELETE /api/admin/pricing/offers). Loads existing pricing on edit; blank rate removes override. Verified (iteration_10: create/persist/blank-remove).
6. **(DONE 2026-06) Dispatch Register page** (/admin/dispatch-list, nav "Dispatch Register") — lists all dispatched orders with transport/freight/date/LR, filters (transport, freight, date range, search) via GET /api/admin/dispatches, client-side CSV export. **Editable Message Templates** (/admin/message-templates, nav "Message Templates") — 4 templates (order_received/confirmed/dispatched/delivered) with placeholder chips ({name}/{order}/{transport}/{cases}/{lr}/{freight}); GET/PUT /api/admin/message-templates; dispatch WhatsApp now uses order_dispatched template. Verified (iteration_10).
7. **(DONE 2026-06) Quick Order sticky total bar** — fixed bottom bar shows running item count + estimated value (logged-in only); Review Cart button. Verified via screenshot.
8. **(DONE 2026-06) Order status templates wired** — PATCH /api/admin/orders/{id}/status now sends the editable Message Templates (order_confirmed / order_processing / order_delivered; dispatched via dispatch endpoint). Added order_processing template. Verified via WhatsApp notification log (iteration_11).
9. **(DONE 2026-06) Order edit → per-item Out-of-Stock + single consolidated message** — order edit UI adds an "Out of stock" checkbox per line + a single "notify_out_of_stock" checkbox; backend PUT /api/admin/orders/{id} accepts items[].out_of_stock and sends ONE WhatsApp listing ALL flagged items (template order_items_out_of_stock, {items} placeholder). Read-view shows OUT OF STOCK badges; activity log records the action. Verified (iteration_11 frontend + curl: 2/3 items → single message).
- (Done) Pre-login MRP-only pricing.

## Backlog (P1/P2)
- P1 (DONE 2026-06): **Dispatch fully editable (bug fix)** — reported "ready to dispatch / dispatched not able to edit". Two fixes: (1) DispatchSection now derives "dispatched" from a real dispatch record (cases + transport), not order.status — so setting status via the dropdown never locks editing (previously caused a 400 "cases required"). OrderDetail + DispatchSection keyed by order id (no stale state across orders). (2) The Dispatched summary now has an Edit toggle exposing ALL fields (cases, transport, freight, dispatch date, LR, invoice no/value/date) with Save/Cancel; Save disabled until cases & transport present; edits use notify=false. Backend dispatch endpoint updates all fields when a record already exists. Verified end-to-end (iteration_12 + iteration_13, 100%).
- P1 (DONE 2026-06): **Cart qty typing + Quick Order all-offers + admin prev-pricing** —
  - Cart page qty is now an editable input (type a number, commits on blur/Enter, clamps to min 1; +/- still work) — previously +/- only.
  - Quick Order shows ALL active schemes per variant as chips (each pack variant row shows its own offers) — previously only the first scheme.
  - Admin order Edit Pricing now shows "Previously bought @ ₹X · offer" per line via GET /api/admin/orders/{oid}/prev-pricing (reads active customer_prices for the order's customer + variants) so admins avoid rate/offer mismatch.
  - Verified end-to-end (iteration_14, 100%).
- P1 (DONE 2026-06): **Guest gating + registration-first flow** —
  - Product cards: guests see ONLY a "View" button; registered logged-in customers see View + Add to Cart (per-card and across all listings).
  - Product detail: guests see a highlighted "Login to View Your Prices" card (data-testid=login-to-order-card) with Create Account / Login buttons; qty stepper + Add to Cart + Buy Now hidden until logged in.
  - Redirect-back: login/register carry ?redirect=/products/{slug}; after OTP login the user returns to the exact product they were viewing (Account.jsx useEffect). Register "Go to Login" forwards the redirect too.
  - New self-registration now sends a WhatsApp alert to every admin number (kind new_registration) for fast approval, in addition to the existing email.
  - Verified end-to-end (iteration_15: backend 5/5, frontend 6/6).
- P1: SMTP wiring (plug credentials in Admin), pincode auto state/district lookup.
- P1 (DONE 2026-06): **Real WhatsApp API live** — wa.animitra.in integration replaces the mock. helpers.send_whatsapp posts to POST /api/v1/send/text with Bearer key; admin-editable API Base URL / API Key / Session in WhatsApp Settings; live session-status card (GET /api/admin/whatsapp/status) + Send-Test (POST /api/admin/whatsapp/test). Numbers auto-prefixed to 91 for 10-digit. Provided key is send-only (no sessions:read scope) so status shows "Active (send-only key)"; real sends verified (messageId returned). Key stored in DB (db.settings/whatsapp), NOT in source. Email/SMTP still MOCKED.
- P1 (DONE 2026-06): **WhatsApp QR/full status** — status endpoint now hits GET /api/v1/sessions/{slug} (returns connected/phone/name/hasQr/qrDataUrl/pairingCode); admin card renders a scan-QR block when the session needs linking (works once key has sessions:read scope; current key is send-only).
- P1 (DONE 2026-06): **Incoming WhatsApp webhook → CRM/ticket inbox** — public POST /api/whatsapp/webhook (optional ?token= secret in WhatsApp Settings). Incoming messages: logged inbound in notification_logs, matched to CRM contact by last-10-digit phone (auto-creates contact if new), and threaded into an open type="WhatsApp" ticket (creates one if none). Group messages skipped. Webhook URL shown + copyable in admin. Verified.
- P1 (DONE 2026-06): **Restock alerts** — order edit detects items transitioning OOS→in-stock; PUT /api/admin/orders/{id} accepts notify_restock and sends ONE consolidated "back in stock" WhatsApp (template order_items_back_in_stock, {items}). Frontend shows a green consolidated notice. SAFETY FIX: edit_order now returns 400 (never wipes items) if any requested variant can't be resolved in the catalog (guards against stale variant IDs after re-seed). Verified end-to-end.
- P1 (DONE 2026-06): **Ticket WhatsApp notifications** — ticket creation and status changes now send real WhatsApp to the customer (previously only in-app `notify()`). Editable templates `ticket_created` / `ticket_status` added to Message Templates ({name}/{ticket}/{title}/{status}). Respects ticket_config.channels.whatsapp toggle. Verified sent.
- P1 (DONE 2026-06): **Webhook hardening + dedup** — GET /api/whatsapp/webhook verifier for provider reachability checks; POST parses JSON or form and tolerant field names (remote_jid/from/sender, text/body/message, push_name/pushName/name, message_id/id). Dedup: incoming messages thread into the customer's most recent WhatsApp ticket updated within 7 days (reopens it if closed), only creating a new ticket beyond that window — prevents multiple tickets per number. Auto-ack (ticket_created) sent on new webhook ticket. Verified: 3 messages from one number → single ticket VM-1053.
- P1 (DONE 2026-06): **Reply from ticket via WhatsApp** — POST /api/tickets/{tid}/reply sends an agent message to the customer through the WhatsApp API and logs it to the ticket timeline (activity "whatsapp_reply", kind ticket_reply). Ticket detail sheet has a green "Reply via WhatsApp" box (data-testid ticket-reply-box / ticket-reply-message / ticket-reply-send) with delivery feedback. Verified real send (delivery: sent).
- P1 (DONE 2026-06): **Unknown-number tickets auto-create CRM lead** — webhook already creates a CRM contact (name = WhatsApp push name, phone = sender) when the number isn't in the DB, then opens/threads the ticket. Now tagged source="whatsapp" + auto_created=True; CRM list shows a "NEW · WHATSAPP" badge and blank-company placeholder so staff can complete the profile later (fully editable via the CRM edit dialog). Verified: number 917000099888 → contact "Dr New Vet" + ticket VM-1055 → edited to "Salem Pet Clinic" (persists, source retained).
- P1 (DONE 2026-06): **Webhook diagnostics + tolerant parsing** — every incoming webhook hit is stored raw in db.webhook_debug (view via GET /api/admin/whatsapp/webhook-debug, admin) so the real provider payload can be inspected. Parser now walks nested containers (data/message/payload/messages, incl. arrays) and many field aliases (remote_jid/remoteJid/from/sender/chatId/jid/author; text/body/caption/conversation/content; push_name/pushName/notifyName/senderName/name; message_id/messageId/id). Skips fromMe (outgoing) and groups. Verified documented + nested formats both create tickets (VM-1056/1057). If real inbound still not creating tickets, cause is provider-side webhook config (URL not set in wa.animitra.in) — confirm via webhook-debug (empty = not reaching us).
- P1 (DONE 2026-06): **Products & Orders corrections batch** —
  - Product card & detail no longer show a flat "selling price"; guests see MRP only, logged-in see their category "your price" (category pricing lives on the variants/pricing tab).
  - Related products now auto-resolve by category (up to 8 same-category active products); manual related-product selection removed from the admin form.
  - Product delete removed (protects historical transactions) — replaced with an active/inactive toggle in the product list.
  - Dispatch: LR/Tracking no longer required at "Prepare for Dispatch"; added Invoice Number/Value/Date. LR + invoice are editable AFTER dispatch (post-dispatch "Save LR / Invoice" panel; re-posting dispatch updates without re-notifying). Dispatch endpoint no longer 400s on missing LR.
  - Orders table columns added: Status, Transport, Freight (To Pay/Paid), Invoice # (also in CSV/Excel/PDF export).
  - Frontend order history now shows unit rate + scheme/offer label + free qty per line, reflecting admin edits and future orders. Verified end-to-end.
- P2: Structured data (JSON-LD) on product/article, image WebP optimization pipeline, granular per-admin custom permissions UI, order edit (add/remove products) UI in admin.

## Implemented — Feature Batch 12 (2026-06) — UX fixes
- **Scroll-to-top on navigation**: added components/ScrollToTop.jsx (wired in App.js inside BrowserRouter). Every route change now starts at the top of the page (fixed pages/products landing mid-scroll).
- **Header menu**: removed the "Order on WhatsApp" header button and the duplicate "Quick Order" nav text link; a single green "Quick Order" button (data-testid quick-order-btn → /quick-order) now sits on the right. Top-bar WhatsApp contact link and Home hero button are unchanged.
- **Products dropdown with subcategories**: header Products menu is now data-driven from /api/categories — each main category (parent_id null) shows as a heading with its subcategories (parent_id set) beneath, plus All Products. Mobile hamburger mirrors this. TEST_ categories hidden.
- Verified: testing_agent iteration_19 (100% — scroll reset, button swap, subcategory dropdown desktop + mobile).

## Implemented — Feature Batch 11 (2026-06) — Checkout T&C, Cash Discount, Order Origin
- **Delivery address**: checkout already defaults to the customer's saved/registered address with an option to enter a new one; the chosen address flows to the admin order (unchanged, confirmed).
- **Terms & Conditions**: compulsory checkbox at checkout (Confirm disabled until ticked); "View" opens a popup with T&C text (editable in Admin → Website Settings → Checkout Terms; sensible default if blank). Backend rejects orders without accept_terms (400).
- **Cash Discount Bill (4%)**: optional checkbox; stored as order.cash_discount. Admin order detail highlights "CASH DISCOUNT BILL (4%) REQUESTED"; the value is NOT computed/shown to the customer (applied on final invoice). Included in customer WhatsApp/email sheet + admin alert.
- **Order origin / authenticity**: on order creation the server captures IP (X-Forwarded-For), User-Agent → browser/OS/device, IP-based location (ip-api.com best-effort), plus client timezone/screen/language. Stored in order.origin, shown in Admin order detail ("Order Origin") and appended to the customer order sheet (WhatsApp + email) and admin alert.
- Verified end-to-end via curl: terms gating 400; order with cash_discount + origin (IP 49.36.100.50 → Mumbai, Chrome/iOS/Mobile) stored and returned; admin fetch shows flags. Frontend compiles; checkboxes use shadcn Checkbox.

## Implemented — Feature Batch 10 (2026-06) — Pricing/Offer engine fixes
- **Best-offer = lowest NET RATE**: compute_scheme(qty, schemes, base_rate) now picks exactly ONE offer with the cheapest effective per-piece rate (net = paid ÷ pieces received). Fairly compares free-goods vs slab/case-price offers. NEVER stacks (previously it could apply a free offer AND a case price together).
- **Ratio simplification**: free-qty offers reduced to lowest terms via _simplify() (Buy 10 Get 5 → 2+1, 12+4 → 3+1) and applied proportionally so smaller quantities also earn free units. compute_upsell + frontend use the simplified ratio.
- **Net rate everywhere**: price_line returns net_rate; cart line + Cart page show a Net Rate column (+GST). Product page shows a live "Net rate: ₹.. /unit + GST" line and marks the winning offer with an 'Applied' badge (others dimmed), updating as qty changes.
- **Cart replace bug fixed**: CartContext.addItem accepts a replace flag; product-page Add to Cart / Buy Now now REPLACE the qty for the same variant (10 then 36 → 36, not 46).
- Verified: backend curl (qty10→2+1/₹66.67, qty22→22+13/₹62.86, qty36→2+1/₹66.67 beats ₹85 slab, qty72→22+13/₹64.86) + testing_agent iteration_17 (100% on offer selection, ratio display, cart net-rate, cart replace, guest gating).
- Preview test data (test_database only, NOT production): VETKCLOR 100ml has 4 demo offers + an active customer 9000000123 @ ₹100 for testing.

## Implemented — Feature Batch 9 (2026-06)
- **Catalog download analytics**: floating catalog button now logs each download (POST /api/catalog/track {page}); Admin → Reports shows total downloads + top pages (GET /api/admin/catalog/stats, collection catalog_downloads).
- **Review reminder (scheduled)**: platform cron `.emergent/crons.yml` (daily 10:00 IST) → POST /api/cron/review-reminders (Bearer WEBHOOK_CRON_SECRET, backgrounded). Finds orders delivered 3+ days ago without review_reminder_sent, sends WhatsApp + email inviting a review, marks sent. update_status now stamps delivered_at.
- **Site testimonials**: homepage "What Our Partners Say" section shows approved kind=site reviews with overall star rating + Organization JSON-LD aggregateRating. Admins publish testimonials via Content → Reviews → "Add Testimonial" (POST /api/admin/reviews, status approved).
- Env: added WEBHOOK_CRON_SECRET to backend/.env (must be set on VPS too).
- Verified: cron auth 401/200, catalog tracking, testimonial create→homepage, all via curl + UI. No issues.

## Credentials
- Admin: vetmechpharma@gmail.com / Admin@123 (see /app/memory/test_credentials.md)

## Implemented — Feature Batch 8 (2026-06)
- **Careers resume upload**: applicants upload PDF/DOC/DOCX (max 2MB) instead of a link — POST /api/careers/upload-resume (public), stored on disk /api/uploads; admin Applications shows a Download link.
- **Registration License Number**: compulsory for Doctor / Agency / Medical Shop / Distributor (hidden/optional for Farm & Other); validated backend (400) + frontend; stored on customer.
- **Product reviews & ratings**: anyone can submit (name+rating+title+comment) → PENDING; admin approves in /admin/reviews (Content › Reviews) before it shows. Public GET /api/reviews returns approved only; product detail shows average + list + write-a-review form.
- **Per-product SEO / structured data**: SEO.jsx now injects JSON-LD (Product + Offer + AggregateRating) and a canonical link + og:url/twitter tags. Product page passes product JSON-LD.
- **News rich-text editor + Read More**: admin News Content uses a WYSIWYG (RichTextEditor); list cards show "Read More →"; article renders HTML.
- **Menu builder**: admin /admin/menu (Content › Menu Builder) — add/reorder/remove items + custom external links (settings id 'menu'); public Header renders it (Products dropdown + Quick Order pinned).
- **SMTP real email + templates**: helpers.send_email sends real email via SMTP (STARTTLS 587 / SSL 465) using admin SMTP settings, with CC-Admin toggle; falls back to simulated/logged when unconfigured. Email sent alongside WhatsApp for OTP, order received, order status, registration welcome, enquiry, career application. Editable content in /admin/email-templates (settings id 'email_templates'). Public access to smtp/email_templates settings blocked (403).
- **Catalog floating button**: admin uploads master catalog PDF in Website Settings (catalog_url); a fixed right-side "Download Catalog" button appears on all public pages when set.
- Verified: 23/23 backend tests + UI flows pass (iteration_16.json). No issues.
- Deploy note: removed unused `emergentintegrations` dep and added `reportlab`+`num2words` to requirements.txt; seed_data.write_test_credentials now skips gracefully on non-Emergent hosts (VPS).

## Bug Fixes — Pricing Engine (2026-06)
- **Negotiated rate now bound to exact quantity**: When an admin edits an order with a manual rate (e.g. ₹58 for 72 pcs) and "update customer pricing" on, `apply_last_confirmed` now stores the negotiated `qty`. `resolve_pricing(db, product, variant, customer, settings, qty)` applies a `last_confirmed` rate ONLY when the current qty equals the negotiated qty; any other quantity (and product-listing views where qty is None) falls back to the normal category/public rate. Fixes the leak where ₹58 became the customer's standing rate for all quantities. Admin prev-pricing note + endpoint now surface the bound qty ("applies only at qty 72"). Backward compatible: old docs without `qty` still apply as before.
- **Upsell nudge only when net rate improves**: `compute_upsell` (backend) and `computeUpsellFE` (ProductDetail.jsx) now hide the "add X more to get Y free" nudge unless reaching the higher tier strictly lowers the per-unit net rate. At efficient multiples (no wasted remainder) the nudge disappears; it only shows on a genuine per-unit improvement.
- Files: backend/pricing_engine.py, backend/routers/orders.py, frontend/src/pages/ProductDetail.jsx, frontend/src/pages/admin/AdminOrders.jsx.
- Verified: engine test — qty 72 → ₹58 (last_confirmed), qty 10 → actual rate, listing → actual rate; compute_upsell hides nudge at exact multiple, shows on remainder. Frontend compiles/renders.

## SEO Upgrade — P0 Foundation (2026-06)
Non-destructive SEO enhancement (existing functionality preserved). Domain: https://vetmechpharma.in (vetmech.in forwards). Confirmed choices: server-side crawler rendering planned for P1, MRP-only Merchant feed in P2, analytics/GSC admin fields added.
- **Env**: backend/.env SITE_URL + APP_BASE_URL = https://vetmechpharma.in; frontend/.env REACT_APP_SITE_URL = https://vetmechpharma.in.
- **Sitemap** (server.py GET /api/sitemap.xml): now includes home+static pages, all active categories, products, news with lastmod/changefreq/priority, absolute SITE_URL. **Robots** (GET /api/robots.txt): disallows /admin /account /cart /checkout /order-confirmed /api/admin, allows /api/uploads, references Sitemap. NOTE: on VPS these must be exposed at ROOT via nginx (proxy /sitemap.xml + /robots.txt → backend /api/...) — manual nginx step.
- **Shared FE helper** src/lib/seo.js: siteUrl, breadcrumbLd, faqLd, articleLd, organizationLd, websiteLd.
- **SEO.jsx** enhanced: array JSON-LD, robots/noindex, og:site_name, og:type, twitter tags, canonical from SITE_URL+pathname.
- **Per-page structured data** (client-injected): Product page → Product+Offer+AggregateRating + BreadcrumbList + FAQPage (reads product.seo.faqs) + FAQ UI section; Category → BreadcrumbList + CollectionPage + breadcrumb nav + intro; News article → BlogPosting + BreadcrumbList; Home → Organization + WebSite(SearchAction). index.html: real title/description/OG + static Organization+WebSite baseline + theme-color.
- **Backend**: public_product attaches category/subcategory {name,slug}; public_category attaches parent. build_product already passes seo dict through → product SEO fields (focus_keyword, secondary/meta keywords, canonical, og_title/description/image, seo_content, faqs[]) stored with NO schema migration.
- **Admin**: Product SEO tab expanded (focus keyword, canonical, OG fields, SEO content, FAQ repeater) + live "SEO Completeness" indicator; Category editor gains SEO group (title/desc/keywords/intro) via new CrudManager 'seogroup' field type; SEO Settings adds GA4 ID / GTM ID / GSC verification (injected by SeoGlobals from /api/settings/seo).
- **Validated**: iteration_20.json — backend 100% (8/8 pytest), frontend 95%. Known limitation (addressed in P1): SEO is client-rendered, so non-JS social crawlers see generic tags → P1 adds server-side crawler meta/JSON-LD injection.

### SEO backlog
- P1: server-side crawler rendering (index.html meta/JSON-LD injection for bots) + nginx rule; image ALT/lazy pass site-wide; internal linking; admin SEO validation (dupes/missing/broken).
- P2: MRP-only Google Merchant feed; Core Web Vitals pass; 301 redirect manager.

## SEO Upgrade — P1 + P2 (2026-06)
- **SPA Crawler Rendering (dynamic rendering)** — new backend `routers/seo.py`: `GET /api/seo/render?path=...` returns a server-rendered HTML doc with baked-in title/description/canonical/OG + JSON-LD (Product+Breadcrumb+FAQ / CollectionPage+Breadcrumb / BlogPosting+Breadcrumb / Organization+WebSite) and real body text. Fixes social-crawler previews (WhatsApp/FB/LinkedIn) that don't run JS. Wire on VPS via `/app/nginx-seo.conf.example` (bot UA → proxy to /api/seo/render; also exposes /sitemap.xml, /robots.txt at root). Preview note: ingress only routes /api, so test at /api/seo/render directly.
- **MRP Google Merchant feed** — `GET /api/feed/google.xml` RSS2.0 + g: namespace, ONE item per active variant, price=variant MRP INR, brand, availability, condition=new, identifier_exists=no, mpn=sku. MRP-only per user choice (B2B prices stay hidden). 7 items on seed data.
- **SEO Health Check** — `GET /api/admin/seo/audit` (require_module products): per-product missing checks (title, meta desc, slug, image, short desc, focus keyword, FAQ) + score, duplicate title/description detection, category/news light checks, sitemap+feed links. New admin page `/admin/seo-audit` (AdminSeoAudit.jsx) under Content → "SEO Health"; route added in App.js; nav in AdminLayout.
- **Image & Speed pass** — added loading="lazy"+decoding="async" to Home (category/quality/news/gallery imgs), News list, About imgs; hero img kept eager with fetchpriority="high" (LCP). ProductCard/Gallery already lazy.
- SeoSettings now shows automatic-file links (sitemap/robots/feed).
- **Verified**: render (product/category/home all correct JSON-LD types + canonical to vetmechpharma.in), feed (7 items, valid), audit endpoint + admin UI screenshot (3 products flagged, categories/news lists). Frontend compiles clean.
- Deploy: push via Save to GitHub → run deploy-vps.sh → apply nginx-seo.conf.example (nginx -t && reload). Then in Google: submit sitemap + verify GSC + upload/schedule feed in Merchant Center.

## SEO Enhancements — Rich Sitemap Images + Auto-Fill SEO (2026-06)
- **Rich sitemap images**: /api/sitemap.xml now declares xmlns:image and emits <image:image><image:loc>+<image:title> for each active product's image(s) (up to 6), so product photos can be indexed in Google Images. Products moved out of _sitemap_urls into a dedicated image-aware loop in server.py.
- **Auto-Fill SEO (template-based, no LLM — safe for pharma, never invents claims)**: backend routers/seo.py generate_seo(prod) builds title (≤60), meta_description (≤155), focus_keyword and FAQ list purely from EXISTING approved fields (short/full description, composition, indications, dosage, storage, variant pack sizes).
  - `POST /api/admin/seo/suggest` (stateless) → draft for the product editor.
  - `POST /api/admin/seo/autofill-all?overwrite=false` → fills only EMPTY seo fields across all active products (won't overwrite manual edits).
  - Admin UI: product editor SEO tab has "Generate from product info" (fills empty fields for review before Save); SEO Health page has "Auto-fill missing SEO" (bulk) button.
- **Verified**: sitemap image tags present; suggest returns title/meta/focus + 6 FAQs; autofill-all updated 3/3 products → audit now 3/3 OK, 0 issues. No compile/runtime errors.

## Social Share Button on Product (2026-06)
- New reusable component src/components/public/ShareButtons.jsx: WhatsApp, Facebook, X/Twitter, LinkedIn, Copy-link, and native mobile share (navigator.share). Uses the production canonical URL via siteUrl(`/products/{slug}`). Added to ProductDetail.jsx below the price/actions block — visible to guests and logged-in users. testids: share-buttons, share-native, share-whatsapp, share-facebook, share-twitter, share-linkedin, share-copy. Verified rendering via screenshot.

## Customer Reports + Mobile Quick Order (2026-06)
- **Mobile Quick Order**: MobileNav bottom bar last item changed from WhatsApp "Order" link to a "Quick Order" link → /quick-order (mirrors desktop header), Zap icon. testid mobilenav-quick-order.
- **Customers → Reports** (new, non-destructive, reuses orders+customers): backend GET /api/admin/reports/customers (require_module reports) params date_from,date_to,customer_type,days. Computes order value = sum(item unit_price*qty). Returns summary KPIs (customers, active/inactive, orders, revenue, AOV, avg frequency, CLV, repeat, first-time, no-orders-in-N) + lists: customers, top_customers, repeat, first_time, active, inactive, no_recent + geo_state/district/taluk (taluk uses address.taluk||line3). Frontend page AdminCustomerReports.jsx at /admin/customers/reports (nav "Customer Reports" under Sales & Pricing): filter bar, KPI cards, recharts bar charts (top customers, revenue by state), tabs (Overview/All/Top/Repeat/First-time/Active/Inactive/No-Orders-N/Geographic), per-table search+sort+pagination+CSV(Excel) export, drill-down row click → /admin/orders?q=mobile. Verified: 24 customers/9 with orders/₹44,530 revenue; page + charts + geo render.

### Deferred (requested, not yet built)
- P1: Product multi main+subcategory (e.g. Cipromech-TZ in Large Animal + Poultry) + reflect in filters/breadcrumbs/SEO/JSON-LD/sitemap.
- P1: Admin Order Edit → show "Available Offers" selector per line (like product page) so admin can pick an offer.
- P1: Social share OG preview (image/title) — buttons already live; correct WhatsApp/FB unfurl needs the VPS nginx crawler-render rule deployed (works via JS on preview). PDF export for reports (CSV/Excel done).

## Multi-Category + Order Offer Picker + Report Charts/PDF (2026-06)
- **Multi-category products** ("all categories + one primary"): product model adds category_ids[] + subcategory_ids[] (primary category_id/subcategory_id unchanged → used for breadcrumb/canonical/SEO/JSON-LD, satisfying "one primary"). build_product defaults ids to [primary]. public_products & admin_products & related now match via $or(category_id, category_ids) with $and accumulation (backward compatible with old docs). Admin product editor: pill toggles "Also appears in (main categories)" + "Also in (subcategories)"; primary auto-included; submit sends deduped category_ids/subcategory_ids. Verified e2e (product appears under a 2nd category).
- **Admin Order Edit → Available Offers picker**: GET /api/admin/orders/{oid}/offers returns configured schemes per line variant (via applicable_schemes + scheme_desc, filtered by order's customer_category). AdminOrders edit rows render clickable offer chips; free_qty → fills Buy/Free, special/case → fills Rate & clears Buy/Free. Verified (chip "₹270 (min 30)" on MASTOBLISS).
- **Report Charts+**: customer_reports now returns monthly[] (YYYY-MM revenue/orders). Reports Overview adds a Monthly Revenue Trend line chart + District-wise Revenue heat bars.
- **Report PDF**: GET /api/admin/reports/customers/pdf (reportlab) — branded PDF with KPIs, Top Customers table, Revenue by State. "PDF" button next to Apply downloads it (blob via authed api). Reports logic refactored into _customer_reports_data() shared by JSON + PDF routes. Verified (200, application/pdf).

## Category SEO Reflect + Win-back WhatsApp (2026-06)
- **Category SEO reflect**: category crawler-render (/api/seo/render/categories/{slug}) now lists all member products (incl. multi-category via $or category_id/category_ids/subcategory_id/subcategory_ids) as an indexable <ul> of product links + emits ItemList JSON-LD. CategoryPage.jsx also adds ItemList JSON-LD from its product list. So a product in multiple categories strengthens on-page SEO for each of its categories. Verified (h2 + li links + ItemList in render output).
- **Win-back WhatsApp**: Customer Reports → "No Orders (N days)" tab adds a per-row green WhatsApp button opening wa.me/<normalized mobile> with a prefilled win-back message. testid winback-<mobile>. Verified (15 buttons render).

## Order detail + Quick Order offers polish (2026-06)
- **Post-checkout redirect**: Checkout now navigates to /account (My Orders) with a success toast instead of /order-confirmed (route still exists, unused).
- **Account My Orders full detail**: each order line now shows MRP (struck-through) + net unit rate + × qty + free qty + colored scheme badge; added per-order footer with total units (+free) and computed order value. testids order-line-<variant_id>, order-total-<order_number>.
- **Quick Order offers**: added OfferChip (green for free_qty "b+f free", orange for special/case "min+ @ ₹price"). Desktop offer column now color-highlighted; NEW mobile block (md:hidden) under each product shows price + offer chips (previously price/offer columns were hidden on mobile → offers invisible). testid qo-mobile-offers-<variant_id>.
- Verified logged-in via OTP (dev_otp): Quick Order colored chips + mobile blocks render; Account shows MRP/rate/qty/scheme + totals across orders.
