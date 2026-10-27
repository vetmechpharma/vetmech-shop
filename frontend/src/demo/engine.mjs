import { DEMO_KEY, DEMO_SCHEMA, DEMO_PASSWORD, DEMO_OTP, seedDemo } from "./seed.mjs";
import { productProfileExample } from "./productProfileExample.mjs";
import { passwordError } from "../lib/customerAuth.mjs";
import { randomRelatedProducts } from "../lib/relatedProducts.mjs";
import { isLedgerPath, handleLedger } from "./ledgerEngine.mjs";

export class DemoError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const copy = value => JSON.parse(JSON.stringify(value));
const money = value => Math.round(Number(value || 0) * 100) / 100;
const today = () => new Date().toISOString();
const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const gcd = (a, b) => b ? gcd(b, a % b) : a;
const CATEGORIES = ["doctor", "agency", "medical_shop", "distributor", "farm", "other"];
const search = (rows, query) => !query ? rows : rows.filter(row => JSON.stringify(row).toLowerCase().includes(String(query).toLowerCase()));
const pages = (rows, params = {}) => {
  const page = Math.max(1, Number(params.page || 1)), limit = Math.min(500, Math.max(1, Number(params.limit || 50)));
  return { items: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, limit, pages: Math.max(1, Math.ceil(rows.length / limit)) };
};

export function createDemoEngine(storage) {
  let state;
  try { state = JSON.parse(storage.getItem(DEMO_KEY) || "null"); } catch { state = null; }
  if (!state || state.schema !== DEMO_SCHEMA) state = seedDemo();
  state.registration_otps ||= {};
  state.ledger_entries ||= [];
  // Add the product-page example without resetting existing browser-demo edits.
  if (!state.product_profile_demo_v2) {
    state.products = state.products || [];
    if (!state.products.some(product => product.id === productProfileExample.id || product.slug === productProfileExample.slug)) {
      state.products.push(copy(productProfileExample));
    }
    state.product_profile_demo_v2 = true;
  }
  const persist = () => { try { storage.setItem(DEMO_KEY, JSON.stringify(state)); } catch { throw new DemoError(507, "Demo storage is full. Export or reset the demo to continue."); } };
  const get = (collection, id, field = "id") => {
    const value = (state[collection] || []).find(row => row[field] === id);
    if (!value) throw new DemoError(404, "Sample record not found.");
    return value;
  };
  const audit = (action, entity, entity_id) => state.audit_logs.unshift({ id: uid("audit"), actor_name: "Demo Admin", actor_role: "super_admin", action, entity, entity_id, meta: {}, created_at: today() });
  const notify = (kind, message) => state.notification_logs.unshift({ id: uid("notification"), channel: "whatsapp", to: "Demo recipient", kind, message, simulated: true, status: "simulated", created_at: today() });
  const cleanCustomer = c => { const { password, ...rest } = c; return copy({ ...rest, has_password: !!password }); };
  const mobileNumber = value => { const mobile = String(value || "").replace(/\D/g, "").slice(-10); if (mobile.length !== 10) throw new DemoError(400, "Enter a valid 10-digit mobile number"); return mobile; };
  const tokenCustomer = token => state.customers.find(c => token === `demo-customer:${c.id}` && !["suspended", "rejected", "deleted"].includes(c.status));
  const offerList = (variant, customer) => {
    if (!customer || customer.status !== "active") return [];
    const list = state.schemes.filter(s => s.active !== false && (s.variant_id === variant.id || (!s.variant_id && s.product_id === variant.product_id)) && (!s.start_date || s.start_date <= today()) && (!s.end_date || s.end_date >= today()));
    const specific = list.filter(s => s.customer_type === customer.category);
    return copy(specific.length ? specific : list.filter(s => !s.customer_type || s.customer_type === "all"));
  };
  const baseRate = (variant, customer, qty) => {
    if (!customer || customer.status !== "active") return { rate: variant.mrp, source: "mrp" };
    const cp = state.customer_prices.find(c => c.customer_id === customer.id && c.variant_id === variant.id && c.active !== false && (c.source !== "last_confirmed" || !c.qty || c.qty === qty));
    if (cp && cp.rate != null) return { rate: cp.rate, source: "customer_specific", offer: cp.offer };
    const category = state.category_prices.find(c => c.variant_id === variant.id && c.category === customer.category && c.active !== false);
    return { rate: category?.rate ?? variant.selling_price, source: category ? "category" : "public" };
  };
  const enrich = (product, customer) => {
    const p = copy(product);
    p.category = state.categories.find(c => c.id === p.category_id);
    p.subcategory = state.categories.find(c => c.id === p.subcategory_id);
    p.variants = p.variants.map(v => ({ ...v, your_price: customer?.status === "active" ? baseRate(v, customer).rate : null, login_required: customer?.status !== "active", price_source: baseRate(v, customer).source, selling_price: customer ? v.selling_price : null, active_schemes: offerList({ ...v, product_id: p.id }, customer).map(s => ({ ...s, type: s.type || s.scheme_type, buy: s.buy ?? s.buy_quantity, free: s.free ?? s.free_quantity, min: s.min ?? s.min_quantity, max: s.max ?? s.max_quantity })) }));
    return p;
  };
  const linesFor = (items, customer, manual = false) => items.map(item => {
    const product = state.products.find(p => p.variants.some(v => v.id === item.variant_id));
    if (!product || product.active === false) throw new DemoError(400, "A selected product is unavailable.");
    const variant = product.variants.find(v => v.id === item.variant_id), qty = Number(item.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100000) throw new DemoError(400, "Enter a valid whole-number quantity.");
    const rate = baseRate(variant, customer, qty);
    let price = rate.rate, free = 0, label = null, net = price, chosen = null;
    const offers = rate.offer ? [{ id: "custom", active: true, ...rate.offer }] : offerList({ ...variant, product_id: product.id }, customer);
    for (const s of offers) {
      if (s.max_quantity && qty > s.max_quantity) continue;
      let candidate = rate.rate, extra = 0, candidateLabel;
      if (["case_price", "special_price"].includes(s.scheme_type)) {
        if (qty < (Number(s.min_quantity || s.buy_quantity) || 1) || s.special_price == null) continue;
        candidate = Number(s.special_price); candidateLabel = s.name;
      } else {
        const buy = Number(s.buy_quantity), bonus = Number(s.free_quantity);
        if (!buy || !bonus) continue;
        const divisor = gcd(buy, bonus), b = buy / divisor, f = bonus / divisor;
        extra = Math.floor(qty / b) * f;
        candidateLabel = `${b}+${f}`;
      }
      const candidateNet = candidate * qty / (qty + extra);
      if (candidate != null && (net == null || candidateNet < net)) { price = candidate; free = extra; net = candidateNet; label = candidateLabel; chosen = s.id; }
    }
    if (manual && item.unit_price != null) { price = Number(item.unit_price); free = Number(item.free_qty || 0); net = price * qty / (qty + free); label = item.scheme_label || null; }
    if (price == null) throw new DemoError(400, "A rate has not been assigned for this product. Please contact VETMECH before ordering.");
    return { product_id: product.id, product_name: product.name, brand_name: product.brand_name, image: product.image, slug: product.slug, variant_id: variant.id, pack_size: variant.pack_size, unit: variant.unit, units_per_case: variant.units_per_case, sku: variant.sku, mrp: variant.mrp, selling_price: price, unit_price: money(price), net_rate: money(net), price_source: rate.source, offer_source: "demo", gst_percent: variant.gst_percent, gst_inclusive: variant.gst_inclusive, stock_status: variant.stock_status, qty, free_qty: free, dispatch_qty: qty + free, scheme_id: chosen, scheme_label: label, out_of_stock: !!item.out_of_stock };
  });
  const makeOrder = (body, customer, manual = false) => {
    if (!body.items?.length) throw new DemoError(400, "Add at least one item.");
    const items = linesFor(body.items, customer, manual), seq = state.orders.length + 1;
    const order = { id: uid("order"), order_number: `DEMO-${new Date().getFullYear()}-${String(seq).padStart(5, "0")}`, customer_id: customer.id, customer_name: customer.name, customer_mobile: customer.mobile, customer_whatsapp: customer.mobile, customer_category: customer.category, company_name: customer.company_name, address: body.address || customer.default_address, items, status: body.status || "new", total_qty: items.reduce((n, i) => n + i.qty, 0), total_free: items.reduce((n, i) => n + i.free_qty, 0), total_dispatch: items.reduce((n, i) => n + i.dispatch_qty, 0), sales_value: money(items.reduce((n, i) => n + i.unit_price * i.qty, 0)), notes: body.notes || "", cash_discount: !!body.cash_discount, origin: { device: "Development demo", browser: "Demo", os: "Demo", location: "Local sample data", ip: "" }, activity: [{ id: uid("activity"), text: "Sample order created", actor: customer.name, at: today() }], created_at: today(), updated_at: today(), dispatch: null };
    state.orders.unshift(order); notify("order_received", `Sample order ${order.order_number} created. No message was sent.`); return copy(order);
  };
  const makeQuote = (body, existing) => {
    const customer = get("crm_customers", body.customer_id);
    if (!body.items?.length) throw new DemoError(400, "Add at least one quotation item.");
    const items = body.items.map(it => { const gross = Number(it.rate || 0) * Number(it.qty || 0); const discount_amount = it.discount_type === "amount" ? Number(it.discount || 0) : gross * Number(it.discount || 0) / 100; const taxable = Math.max(0, gross - discount_amount), gst_amount = taxable * Number(it.gst || 0) / 100; return { ...it, discount_amount: money(discount_amount), taxable: money(taxable), gst_amount: money(gst_amount), total: money(taxable + gst_amount) }; });
    const summary = { subtotal: money(items.reduce((n, i) => n + Number(i.rate) * Number(i.qty), 0)), discount: money(items.reduce((n, i) => n + i.discount_amount, 0)), gst: money(items.reduce((n, i) => n + i.gst_amount, 0)), grand_total: money(items.reduce((n, i) => n + i.total, 0)) };
    summary.total = summary.subtotal;
    summary.amount_words = `INR ${summary.grand_total.toFixed(2)} (sample)`;
    return { ...existing, ...copy(body), id: existing?.id || uid("quote"), number: existing?.number || `DEMO-Q-${String(state.quotations.length + 1).padStart(4, "0")}`, status: existing?.status || "draft", customer: copy(customer), company_snapshot: copy(state.settings.company), items, summary, total: summary.grand_total, grand_total: summary.grand_total, amount_words: `INR ${summary.grand_total.toFixed(2)} (sample)`, quote_date: body.quote_date || today().slice(0, 10), validity_days: Number(body.validity_days || 15), valid_until: new Date(Date.now() + Number(body.validity_days || 15) * 86400000).toISOString().slice(0, 10), signatory: { name: "Demo Admin", designation: "Development Admin" }, history: [...(existing?.history || []), { at: today(), user: "Demo Admin", action: existing ? "Updated" : "Created" }], created_at: existing?.created_at || today() };
  };
  const customerReport = params => {
    const orders = state.orders.filter(o => o.status !== "cancelled" && (!params.date_from || o.created_at.slice(0, 10) >= params.date_from) && (!params.date_to || o.created_at.slice(0, 10) <= params.date_to));
    const rows = state.customers.filter(c => !params.customer_type || c.category === params.customer_type).map(c => {
      const list = orders.filter(o => o.customer_id === c.id), revenue = money(list.reduce((n, o) => n + o.items.reduce((v, i) => v + i.unit_price * i.qty, 0), 0));
      return { ...cleanCustomer(c), orders: list.length, revenue, aov: list.length ? money(revenue / list.length) : 0, clv: revenue, avg_frequency: list.length, frequency_per_month: list.length, recency_days: list.length ? 2 : 999, last_order: list[0]?.created_at || null };
    });
    const active = rows.filter(c => c.orders), repeat = rows.filter(c => c.orders > 1), first = rows.filter(c => c.orders === 1), inactive = rows.filter(c => !c.orders), revenue = money(rows.reduce((n, c) => n + c.revenue, 0)), total_orders = rows.reduce((n, c) => n + c.orders, 0);
    const geo = [{ name: "Tamil Nadu", label: "Tamil Nadu", revenue, value: revenue, orders: total_orders, customers: rows.length }];
    return { summary: { total_customers: rows.length, active_customers: active.length, inactive_customers: inactive.length, total_orders, total_revenue: revenue, revenue, aov: total_orders ? revenue / total_orders : 0, avg_frequency: total_orders / (rows.length || 1), clv: revenue / (rows.length || 1), repeat_customers: repeat.length, first_time_customers: first.length, no_orders_count: inactive.length, no_orders_days: Number(params.days || 90) }, customers: rows, top_customers: [...rows].sort((a, b) => b.revenue - a.revenue), repeat, first_time: first, active, inactive, no_recent: inactive, geo_state: geo, geo_district: [{ ...geo[0], name: "Tirupur", label: "Tirupur" }], geo_taluk: [], monthly: [{ month: today().slice(0, 7), revenue, orders: total_orders }] };
  };

  async function handle({ method = "GET", path, params = {}, body = {}, token = "" }) {
    method = method.toUpperCase();
    const url = new URL(path, "https://demo.invalid");
    path = url.pathname.replace(/^\/api(?=\/|$)/, "").replace(/\/$/, "") || "/";
    params = { ...Object.fromEntries(url.searchParams), ...params };
    const parts = path.split("/").filter(Boolean), customer = tokenCustomer(token), admin = token === "demo-admin";
    const mutation = method !== "GET";
    if ((path.startsWith("/admin/") || path.startsWith("/tickets") || path.startsWith("/crm/")) && !admin) throw new DemoError(401, "Enter the admin demo to continue.");
    let result;
    if (isLedgerPath(path)) result = await handleLedger({state,method,parts,body,params,customer,admin,now:today,uid,ErrorType:DemoError});
    else if (path === "/auth/admin/login") {
      if (body.email !== "demo@vetmech.local" || body.password !== DEMO_PASSWORD) throw new DemoError(401, "Demo login: demo@vetmech.local / Demo@123");
      result = { token: "demo-admin", user: copy(state.admin_users[0]) };
    } else if (path === "/auth/admin/me") {
      if (!admin) throw new DemoError(401, "Enter the admin demo.");
      result = copy(state.admin_users[0]);
    } else if (path === "/auth/customer/me") {
      if (!customer) throw new DemoError(401, "Enter the customer demo."); result = cleanCustomer(customer);
    } else if (path === "/auth/otp/request") {
      const mobile = mobileNumber(body.mobile);
      if (state.customers.some(c => c.mobile === mobile)) throw new DemoError(409, "This mobile is already registered. Sign in with your password.");
      const previous = state.registration_otps[mobile], recent = previous && previous.window_start > Date.now() - 900000;
      if (recent && previous.requests >= 5) throw new DemoError(429, "Too many OTP requests. Please try again later.");
      state.registration_otps[mobile] = { expires: Date.now() + 600000, verified: false, attempts: 0, requests: recent ? previous.requests + 1 : 1, window_start: recent ? previous.window_start : Date.now() };
      result = { sent: true, dev_otp: DEMO_OTP, message: `Demo registration OTP: ${DEMO_OTP}. No message was sent.` };
    } else if (path === "/auth/otp/verify") {
      const mobile = mobileNumber(body.mobile), record = state.registration_otps[mobile];
      if (state.customers.some(c => c.mobile === mobile)) throw new DemoError(409, "OTP is only for new registrations. Sign in with your password.");
      if (!record || record.expires <= Date.now() || record.verified) throw new DemoError(400, "Request a new registration OTP.");
      if (record.attempts >= 5) throw new DemoError(429, "Too many incorrect attempts. Request a new OTP.");
      if (body.otp !== DEMO_OTP) { record.attempts++; persist(); throw new DemoError(400, "Invalid registration OTP."); }
      Object.assign(record, { verified: true, token: uid("registration"), registration_expires: Date.now() + 900000, consumed: false });
      result = { verified: true, registered: false, mobile, verification_token: record.token };
    } else if (path === "/auth/login/password") {
      const mobile = mobileNumber(body.mobile), found = state.customers.find(c => c.mobile === mobile);
      if (!found?.password || body.password !== found.password) throw new DemoError(401, "Invalid mobile number or password");
      if (["suspended", "rejected", "deleted"].includes(found.status)) throw new DemoError(403, "This sample account is inactive.");
      result = { token: `demo-customer:${found.id}`, customer: cleanCustomer(found), status: found.status };
    } else if (path === "/auth/register") {
      const mobile = mobileNumber(body.mobile), record = state.registration_otps[mobile];
      if (state.customers.some(c => c.mobile === mobile)) throw new DemoError(409, "This sample mobile is already registered.");
      if (passwordError(body.password)) throw new DemoError(400, passwordError(body.password));
      if (!body.name?.trim()) throw new DemoError(400, "Please enter your name");
      if (!CATEGORIES.includes(body.category || "other")) throw new DemoError(400, "Choose a valid customer category");
      if (["doctor", "agency", "medical_shop", "distributor"].includes(body.category) && !body.license_number?.trim()) throw new DemoError(400, "License Number is required for your selected category");
      if (!record?.verified || record.consumed || !record.token || record.token !== body.verification_token || record.registration_expires <= Date.now()) throw new DemoError(400, "Verify your mobile number with a registration OTP first.");
      record.consumed = true;
      const { verification_token, ...details } = copy(body), status = state.settings.pricing_engine.require_approval === false ? "active" : "pending";
      state.customers.push({ ...details, mobile, id: uid("customer"), status, active: true, addresses: [], created_at: today() });
      result = { registered: true, status, message: status === "pending" ? "Sample registration saved. Approve it in the admin demo." : "Sample account created. You can now sign in with your password." };
    } else if (path === "/health" || path === "/") result = { status: "ok", mode: "demo" };
    else if (parts[0] === "settings" || (parts[0] === "admin" && parts[1] === "settings")) {
      const id = parts[parts.length - 1]; if (mutation) state.settings[id] = { ...state.settings[id], ...copy(body), id }; result = copy(state.settings[id] || { id });
    } else if (path === "/products" || path === "/admin/products" || path === "/products/by-ids") {
      if (method === "GET") {
        let rows = search(state.products.filter(p => admin || p.active !== false), params.q || params.search);
        if (params.category || params.category_id) { const id = state.categories.find(c => c.slug === params.category || c.id === params.category_id)?.id; rows = rows.filter(p => [p.category_id, p.subcategory_id, ...(p.category_ids || []), ...(p.subcategory_ids || [])].includes(id)); }
        if (params.brand || params.brand_id) rows = rows.filter(p => p.brand_id === (params.brand_id || params.brand));
        if (params.badge) rows = rows.filter(p => p.badges?.[params.badge]);
        if (params.ids) rows = rows.filter(p => String(params.ids).split(",").includes(p.id));
        result = path.endsWith("by-ids") ? rows.map(p => enrich(p, customer)) : pages(rows.map(p => path.startsWith("/admin") ? copy(p) : enrich(p, customer)), params);
      } else { const p = normalizeProduct(body); state.products.unshift(p); result = copy(p); }
    } else if (parts[0] === "products" && parts[1]) {
      const p = state.products.find(p => p.slug === parts[1] && p.active === true); if (!p) throw new DemoError(404, "Product not found.");
      const related = randomRelatedProducts(p, state.products).map(row => enrich(row, customer));
      result = { ...enrich(p, customer), related, related_products: related };
    } else if (path === "/cart/calculate") {
      const items = body.items?.length ? linesFor(body.items, customer) : [];
      result = { items, total_qty: items.reduce((n, i) => n + i.qty, 0), total_free: items.reduce((n, i) => n + i.free_qty, 0), total_dispatch: items.reduce((n, i) => n + i.dispatch_qty, 0), line_count: items.length };
    } else if (path === "/orders" && mutation) {
      if (!customer || customer.status !== "active") throw new DemoError(403, "Log in with an approved sample customer.");
      if (!body.accept_terms) throw new DemoError(400, "Accept the demo terms before placing an order.");
      if (body.mobile !== customer.mobile) throw new DemoError(403, "Use your logged-in sample mobile.");
      result = makeOrder(body, customer);
    } else if (path === "/orders/mine") {
      if (!customer) throw new DemoError(401, "Customer login required."); result = copy(state.orders.filter(o => o.customer_id === customer.id));
    } else if (parts[0] === "orders" && parts[1]) {
      const order = get("orders", parts[1]); if (!customer || order.customer_id !== customer.id) throw new DemoError(403, "This is another sample customer's order.");
      result = parts[2] === "reorder" ? { items: linesFor(order.items, customer) } : copy(order);
    } else if (path === "/admin/dashboard") result = dashboard();
    else if (path === "/admin/customers-pending-count") result = { count: state.customers.filter(c => c.status === "pending").length };
    else if (parts[0] === "admin" && parts[1] === "customers") result = customersApi(method, parts, params, body);
    else if (parts[0] === "admin" && parts[1] === "orders") result = ordersApi(method, parts, params, body);
    else if (path === "/admin/dispatches") result = pages(state.orders.filter(o => o.dispatch).map(o => ({ ...copy(o), ...o.dispatch })), params);
    else if (parts[0] === "admin" && parts[1] === "pricing") result = pricingApi(method, parts, body);
    else if (parts[0] === "admin" && parts[1] === "quotations") result = quotesApi(method, parts, params, body);
    else if (path === "/admin/reports/customers") result = customerReport(params);
    else if (path === "/admin/reports/customers/pdf") result = { demo_pdf: ["VETMECH - Sample Customer Report", `Customers: ${state.customers.length}`, `Orders: ${state.orders.length}`, "Development demo - illustrative values only."] };
    else if (path === "/admin/reports/summary") result = { total_orders: state.orders.length, total_value: dashboard().sales_value, most_reordered: state.products.map(p => ({ product_name: p.name, count: 2, qty: 12 })) };
    else if (path === "/admin/backup/stats") result = { collections: Object.fromEntries(Object.entries(state).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length])), total_records: Object.values(state).filter(Array.isArray).reduce((n, a) => n + a.length, 0), image_count: state.products.length, image_size_mb: 0.02 };
    else if (path === "/admin/backup/database") result = { format: "vetmech-shop-demo", version: 1, generated_at: today(), data: copy(state) };
    else if (path === "/admin/catalog/stats") result = { total: state.catalog_downloads.length, total_downloads: state.catalog_downloads.length, top_pages: [] };
    else if (path === "/catalog/track") { state.catalog_downloads.push({ id: uid("download"), ...body, created_at: today() }); result = { ok: true }; }
    else if (path === "/admin/whatsapp/status") result = { status: "simulated", connected: false, message: "Demo mode. No gateway is connected." };
    else if (path === "/admin/whatsapp/test") { notify("test", "Demo message simulated."); result = { status: "simulated", sent: false, simulated: true }; }
    else if (path === "/admin/whatsapp/webhook-debug") result = { items: [] };
    else if (path === "/admin/message-templates") { if (mutation) state.settings.message_templates = copy(body); result = copy(state.settings.message_templates); }
    else if (parts[0] === "admin" && parts[1] === "seo") result = seoApi(parts, body, mutation);
    else if (parts[0] === "tickets") result = ticketsApi(method, parts, params, body);
    else if (path === "/admin/tickets/config") { state.settings.ticket_config = copy(body); result = copy(body); }
    else if (parts[0] === "crm" && parts[1] === "customers") {
      result = collectionApi("crm_customers", method, parts[2], params, body, true);
      if (parts[2] && method === "GET") {
        const tickets = state.tickets.filter(t => t.customer_id === parts[2]);
        result = { ...result, tickets: copy(tickets), activity: [], stats: { total: tickets.length, open: tickets.filter(t => t.status === "open").length, pending: tickets.filter(t => t.status === "pending").length, completed: tickets.filter(t => t.status === "closed").length, overdue: 0 } };
      }
    }
    else if (path === "/search") result = { results: search(state.products.filter(p => p.active), params.q).map(p => enrich(p, customer)), products: search(state.products.filter(p => p.active), params.q).map(p => enrich(p, customer)), categories: search(state.categories, params.q), news: [] };
    else if (path === "/reviews" || path === "/admin/reviews") {
      if (method === "GET") { const items = state.reviews.filter(r => (admin || r.status === "approved") && (!params.product_id || r.product_id === params.product_id) && (!params.kind || r.kind === params.kind) && (!params.status || r.status === params.status)); result = { ...pages(items, params), average: items.length ? items.reduce((n, r) => n + Number(r.rating), 0) / items.length : 0, count: items.length }; }
      else { state.reviews.unshift({ ...copy(body), id: uid("review"), status: admin ? body.status || "approved" : "pending", created_at: today() }); result = { message: "Sample review saved for approval.", ok: true }; }
    } else if (path === "/enquiries" || path === "/careers/apply") { (path === "/enquiries" ? state.enquiries : state.applications).unshift({ ...copy(body), id: uid("form"), created_at: today() }); result = { ok: true }; }
    else {
      const route = parts[0] === "admin" ? parts[1] : parts[0];
      const collection = { products: "products", categories: "categories", brands: "brands", units: "units", transports: "transports", users: "admin_users", schemes: "schemes", news: "news", gallery: "gallery", careers: "careers", enquiries: "enquiries", applications: "applications", reviews: "reviews", notifications: "notification_logs", "audit-logs": "audit_logs", pages: "pages" }[route];
      if (!collection) throw new DemoError(501, "This operation needs the connected backend. The development demo keeps data on this device.");
      const id = parts[0] === "admin" ? parts[2] : parts[1];
      result = collectionApi(collection, method, id, params, body, ["products", "notifications", "audit_logs"].includes(collection));
    }
    if (mutation) { audit(method.toLowerCase(), path, result?.id || "demo"); persist(); }
    return copy(result);
  }

  function normalizeProduct(body, existing) {
    const name = body.name || existing?.name || "Sample Product";
    return { image: "/demo/product-1.svg", images: [], category_ids: [], subcategory_ids: [], badges: {}, seo: {}, active: true, brand_name: "VETMECH", ...existing, ...copy(body), id: existing?.id || uid("product"), name, slug: body.slug || existing?.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), variants: (body.variants || existing?.variants || []).map(v => ({ min_order_qty: 1, stock_status: "in_stock", ...v, id: v.id || uid("variant") })), created_at: existing?.created_at || today() };
  }
  function collectionApi(name, method, id, params, body, paginated = false) {
    const field = name === "pages" ? "slug" : "id";
    if (method === "GET") { if (id) return copy(get(name, id, ["news", "categories"].includes(name) && !state[name].some(r => r.id === id) ? "slug" : field)); const rows = search(state[name], params.q); return paginated ? pages(copy(rows), params) : copy(rows); }
    if (method === "POST") { const row = name === "products" ? normalizeProduct(body) : { ...copy(body), id: uid(name), parent_id: body.parent_id === "none" ? null : body.parent_id, slug: body.slug || (body.name || body.title || "sample").toLowerCase().replace(/[^a-z0-9]+/g, "-"), created_at: today() }; state[name].unshift(row); return copy(row); }
    const row = get(name, id, field);
    if (method === "DELETE") { if (name === "admin_users" && id === "demo-admin") throw new DemoError(400, "Keep the main demo administrator. You can reset sample data from Demo tools."); state[name] = state[name].filter(r => r[field] !== id); return { deleted: true }; }
    const next = name === "products" ? normalizeProduct(body, row) : { ...row, ...copy(body), parent_id: body.parent_id === "none" ? null : body.parent_id ?? row.parent_id };
    Object.assign(row, next); return copy(row);
  }
  function customersApi(method, parts, params, body) {
    const id = parts[2], action = parts[3];
    if (!id && method === "GET") return pages(search(state.customers.filter(c => (params.status && params.status !== "all" ? c.status === params.status : c.status !== "deleted") && (!params.category || c.category === params.category)), params.q).map(c => ({ ...cleanCustomer(c), order_count: state.orders.filter(o => o.customer_id === c.id).length })), params);
    if (!id) { if (passwordError(body.password)) throw new DemoError(400, passwordError(body.password)); if (state.customers.some(c => c.mobile === body.mobile)) throw new DemoError(400, "Mobile already exists in the demo."); const row = { ...copy(body), id: uid("customer"), status: body.status || "active", active: true, addresses: [], created_at: today() }; state.customers.push(row); return cleanCustomer(row); }
    const row = get("customers", id);
    if (method === "DELETE") { row.status = "deleted"; row.active = false; return { deleted: true }; }
    if (action) {
      const states = { approve: "active", reject: "rejected", suspend: "suspended", reactivate: "active" };
      if (states[action]) row.status = states[action];
      if (action === "change-category") row.category = body.category;
      if (action === "reset-password") { if (passwordError(body.password)) throw new DemoError(400, passwordError(body.password)); row.password = body.password; }
    } else if (method !== "GET") Object.assign(row, copy(body));
    return { ...cleanCustomer(row), orders: copy(state.orders.filter(o => o.customer_id === id)), order_count: state.orders.filter(o => o.customer_id === id).length, total_value: state.orders.filter(o => o.customer_id === id).reduce((n, o) => n + (o.sales_value || 0), 0), frequent_products: [] };
  }
  function ordersApi(method, parts, params, body) {
    const id = parts[2], action = parts[3];
    if (!id && method === "GET") return pages(search(state.orders.filter(o => (!params.status || o.status === params.status)), params.q), params);
    if (!id) { let c = state.customers.find(c => c.mobile === body.mobile); if (!c) { c = { id: uid("customer"), name: body.name, mobile: body.mobile, company_name: body.company_name, category: body.category || "doctor", status: "active", addresses: [] }; state.customers.push(c); } return makeOrder(body, c, true); }
    const order = get("orders", id), c = get("customers", order.customer_id);
    if (method === "DELETE") { if(order.invoice || order.voided_invoices?.length)throw new DemoError(409,"Orders with invoice history must be retained for the customer ledger");state.orders = state.orders.filter(o => o.id !== id); return { deleted: true }; }
    if(order.invoice&&(action==="status"||action==="dispatch"||(!action&&body.items)))throw new DemoError(409,"Void the posted invoice before changing this order");
    if(action==="status"&&body.status==="closed")throw new DemoError(400,"Use Close order with an invoice number, date and amount");
    if (action === "offers") return Object.fromEntries(order.items.map(i => [i.variant_id, offerList({ id: i.variant_id, product_id: i.product_id }, c).map(s => ({ ...s, type: s.scheme_type, buy: s.buy_quantity, free: s.free_quantity, min: s.min_quantity }))]));
    if (action === "prev-pricing") return { items: order.items.map(i => ({ ...i, rate: i.unit_price, qty: i.qty })) };
    if (action === "status") order.status = body.status;
    if (action === "dispatch") { if (!Number(body.cases) || !body.transport_id) throw new DemoError(400, "Choose a transport and enter cases."); order.dispatch = { ...order.dispatch, ...copy(body), transport_name: get("transports", body.transport_id).name }; order.status = "dispatched"; }
    if (!action && method === "PUT") {
      if (body.items) { order.items = linesFor(body.items, c, true); order.sales_value = money(order.items.reduce((n, i) => n + i.qty * i.unit_price, 0)); order.total_qty = order.items.reduce((n, i) => n + i.qty, 0); order.total_free = order.items.reduce((n, i) => n + i.free_qty, 0); order.total_dispatch = order.total_qty + order.total_free; }
      if (body.notes != null) order.notes = body.notes;
    }
    if (method !== "GET") { order.updated_at = today(); order.activity.push({ id: uid("activity"), text: `Demo ${action || "order"} updated`, actor: "Demo Admin", at: today() }); }
    return copy(order);
  }
  function pricingApi(method, parts, body) {
    const section = parts[2], id = parts[3];
    if (section === "settings") { if (method !== "GET") Object.assign(state.settings.pricing_engine, copy(body)); return copy({ ...state.settings.pricing_engine, enable_otp: false, enable_password_login: true }); }
    if (section === "product") {
      const product = get("products", id);
      if (method !== "GET") for (const row of body.prices || []) { state.category_prices = state.category_prices.filter(p => !(p.variant_id === row.variant_id && p.category === row.category)); if (row.rate != null && row.rate !== "") state.category_prices.push({ ...row, rate: Number(row.rate), product_id: id, active: true }); }
      return { product_id: id, product_name: product.name, categories: CATEGORIES, variants: product.variants.map(v => ({ ...v, variant_id: v.id, public_price: v.selling_price, category_prices: Object.fromEntries(state.category_prices.filter(p => p.variant_id === v.id).map(p => [p.category, p.rate])) })) };
    }
    if (section === "offers") {
      if (method === "GET") return { items: copy(state.schemes.filter(s => s.variant_id === id)) };
      if (method === "DELETE") { state.schemes = state.schemes.filter(s => s.id !== id); return { deleted: true }; }
      const row = { ...copy(body), id: uid("offer"), active: true }; state.schemes.push(row); return row;
    }
    if (section === "category-change") return { affected: [], count: 0, updated: true };
    if (section === "customer") {
      const row = state.customer_prices.find(p => p.customer_id === id && p.variant_id === parts[5]);
      if (parts[4] === "item" && method === "POST") { const p = { ...body, id: uid("price"), customer_id: id, active: true }; state.customer_prices = state.customer_prices.filter(r => !(r.customer_id === id && r.variant_id === body.variant_id)); state.customer_prices.push(p); return p; }
      if (method === "DELETE") { state.customer_prices = state.customer_prices.filter(p => p !== row); return { deleted: true }; }
      if (parts[6] === "protect" && row) row.protected = body.protected;
      return { customer: cleanCustomer(get("customers", id)), category: get("customers", id).category, items: copy(state.customer_prices.filter(p => p.customer_id === id).map(p => { const product = state.products.find(product => product.variants.some(v => v.id === p.variant_id)), variant = product?.variants.find(v => v.id === p.variant_id); return { ...p, product_name: product?.name || "Sample product", pack_size: variant?.pack_size || "", mrp: variant?.mrp }; })) };
    }
    throw new DemoError(501, "This pricing operation requires the full backend.");
  }
  function quotesApi(method, parts, params, body) {
    const id = parts[2], action = parts[3];
    if (id === "dashboard") { const rows = state.quotations; return { total: rows.length, this_month: rows.length, value: rows.reduce((n, q) => n + q.grand_total, 0), accepted_value: rows.filter(q => q.status === "accepted").reduce((n, q) => n + q.grand_total, 0), conversion_rate: rows.length ? rows.filter(q => q.converted_order).length / rows.length * 100 : 0, counts: Object.fromEntries(["draft", "sent", "accepted", "rejected", "expired"].map(s => [s, rows.filter(q => q.status === s).length])), top_customers: [] }; }
    if (!id && method === "GET") return pages(search(state.quotations.filter(q => !params.status || q.status === params.status), params.q), params);
    if (!id) { const q = makeQuote(body); state.quotations.unshift(q); return copy(q); }
    const q = get("quotations", id);
    if (action === "pdf") return { demo_pdf: ["VETMECH - Development Quotation", q.number, q.customer.company_name, ...q.items.map(i => `${i.name} | Qty ${i.qty} | INR ${i.rate} | Total INR ${i.total}`), `Total: INR ${q.grand_total}`, "Sample quotation only. No commercial commitment."] };
    if (action === "status") q.status = body.status;
    if (action === "send") { notify("quotation", `Simulated quotation ${q.number}.`); return { sent: false, simulated: true, status: "simulated", channel: body.channel }; }
    if (action === "duplicate") { const next = makeQuote(q); next.status = "draft"; state.quotations.unshift(next); return copy(next); }
    if (action === "convert") { const c = state.customers.find(c => c.id === q.customer_id); if (!c || q.items.some(i => !i.variant_id)) throw new DemoError(400, "Demo conversion requires an existing customer and catalogue variants."); const order = makeOrder({ items: q.items.map(i => ({ ...i, unit_price: i.rate })), address: c.default_address }, c, true); q.status = "accepted"; q.converted_order = order.order_number; return { order_number: order.order_number }; }
    if (method === "DELETE") { state.quotations = state.quotations.filter(r => r.id !== id); return { deleted: true }; }
    if (method === "PUT") Object.assign(q, makeQuote(body, q));
    return copy(q);
  }
  function ticketsApi(method, parts, params, body) {
    const id = parts[1], action = parts[2];
    if (id === "config") return copy(state.settings.ticket_config);
    if (id === "staff") return copy(state.admin_users);
    if (id === "notifications") return method === "GET" ? { items: [], unread: 0, unread_count: 0 } : { ok: true };
    if (id === "dashboard") { const kpi = { total: state.tickets.length, open: 0, in_progress: 0, pending: 0, overdue: 0, completed: 0 }; state.tickets.forEach(t => { kpi[t.status === "closed" ? "completed" : t.status]++; }); return { kpi, overview: [], by_type: [], by_priority: [], recent: copy(state.tickets), overdue: [] }; }
    if (id === "reports") return { employee: [{ name: "Demo Admin", total: state.tickets.length, completed: state.tickets.filter(t => t.status === "closed").length, pending: state.tickets.filter(t => t.status !== "closed").length, overdue: 0, rate: 33 }], by_type: [], top_customers: [], most_complaints: [], performance: { total: state.tickets.length, completed: state.tickets.filter(t => t.status === "closed").length, pending: state.tickets.filter(t => t.status !== "closed").length, overdue: 0, avg_completion_hours: 0 } };
    if (!id && method === "GET") return pages(search(state.tickets.filter(t => (!params.status || t.status === params.status) && (!params.type || t.type === params.type) && (!params.priority || t.priority === params.priority)), params.q), params);
    if (!id) { const c = get("crm_customers", body.customer_id); const row = { ...copy(body), id: uid("ticket"), ticket_number: `DEMO-T-${state.tickets.length + 101}`, status: "open", effective_status: "open", customer_name: c.name, company_name: c.company_name, customer_phone: c.phone, customer_email: c.email, assignee_name: "Demo Admin", is_overdue: false, activity: [], updates: [], attachments: [], created_at: today(), updated_at: today() }; state.tickets.unshift(row); return copy(row); }
    const t = get("tickets", id);
    if (action === "status") t.status = t.effective_status = body.status;
    if (action === "updates" || action === "reply") { t.activity.push({ id: uid("activity"), at: today(), text: body.message || body.text || body.comment || "Sample update", actor: "Demo Admin", action: action === "reply" ? "whatsapp_reply" : "comment" }); if (action === "reply") return { ok: true, delivery: "simulated", simulated: true }; }
    if (action === "attachments") { if (method === "DELETE") t.attachments = t.attachments.filter(a => a.id !== parts[3]); else t.attachments.push({ ...copy(body), id: uid("attachment") }); }
    return copy(t);
  }
  function seoApi(parts, body, mutation) {
    if (parts[2] === "suggest") { const p = body.product || body; return { title: `${p.name || "Product"} | VETMECH`, meta_description: p.short_description || "", focus_keyword: p.name || "", faqs: [] }; }
    if (parts[2] === "autofill-all") return { updated: 0 };
    return { summary: { products: state.products.length, products_ok: state.products.length, products_with_issues: 0 }, products: state.products.map(p => ({ id: p.id, name: p.name, slug: p.slug, score: 100, issues: [] })), categories: [], news: [], duplicate_titles: [], duplicate_descriptions: [], sitemap: "/", feed: "/" };
  }
  function dashboard() {
    const rows = state.orders, sales_value = money(rows.filter(o => o.status !== "cancelled").reduce((n, o) => n + o.items.reduce((v, i) => v + i.unit_price * i.qty, 0), 0));
    return { today_orders: rows.filter(o => o.created_at.slice(0, 10) === today().slice(0, 10)).length, status_counts: Object.fromEntries(["new", "confirmed", "processing", "ready_to_dispatch", "dispatched", "delivered", "closed", "cancelled", "on_hold"].map(s => [s, rows.filter(o => o.status === s).length])), sales_value, total_orders: rows.length, total_customers: state.customers.length, pending_customers: state.customers.filter(c => c.status === "pending").length, repeat_customers: state.customers.filter(c => rows.filter(o => o.customer_id === c.id).length > 1).length, trend: Array.from({ length: 7 }, (_, i) => { const date = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10); return { date, orders: rows.filter(o => o.created_at.startsWith(date)).length }; }), top_products: state.products.map(p => ({ name: p.name, qty: rows.flatMap(o => o.items).filter(i => i.product_id === p.id).reduce((n, i) => n + i.qty, 0) })), category_performance: [{ name: "Large Animal", qty: rows.reduce((n, o) => n + o.total_qty, 0) }], top_customers: state.customers.map(c => ({ name: c.name, orders: rows.filter(o => o.customer_id === c.id).length })) };
  }
  return { handle, snapshot: () => copy(state), reset: () => { state = seedDemo(); persist(); }, enterCustomer: id => { get("customers", id); return `demo-customer:${id}`; } };
}
