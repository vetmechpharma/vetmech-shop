import test from "node:test";
import assert from "node:assert/strict";
import { createDemoEngine } from "../src/demo/engine.mjs";
import { DEMO_KEY } from "../src/demo/seed.mjs";

const memory = () => { const values = new Map(); return { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }; };
const setup = () => { const storage = memory(), engine = createDemoEngine(storage); return { storage, engine, call: (method, path, body, token = "demo-admin", params = {}) => engine.handle({ method, path, body, token, params }) }; };
const customer = "demo-customer:c1";
const orderBody = { mobile: "0000000001", accept_terms: true, items: [{ variant_id: "v1", qty: 10 }], address: { line1: "Demo Clinic", district: "Tirupur", state: "Tamil Nadu", pincode: "638751" } };

test("public catalogue hides B2B prices while customer category prices differ", async () => {
  const { call } = setup();
  const guest = await call("GET", "/products", {}, "");
  assert.equal(guest.items[0].variants[0].your_price, null);
  assert.equal(guest.items[0].variants[0].selling_price, null);
  const doctor = await call("GET", "/products", {}, customer);
  const agency = await call("GET", "/products", {}, "demo-customer:c2");
  assert.equal(doctor.items[0].variants[0].your_price, 650);
  assert.equal(agency.items[0].variants[0].your_price, 585);
  const offer = doctor.items[0].variants[0].active_schemes[0];
  assert.deepEqual({ type: offer.type, buy: offer.buy, free: offer.free }, { type: "free_qty", buy: 10, free: 2 });
});

test("sample customer orders persist across a fresh engine instance", async () => {
  const { call, storage } = setup();
  const order = await call("POST", "/orders", orderBody, customer);
  const next = createDemoEngine(storage);
  const orders = await next.handle({ path: "/orders/mine", token: customer });
  assert.equal(orders[0].id, order.id);
  assert.equal(orders[0].items[0].free_qty, 2);
  assert.equal(orders[0].items[0].unit_price, 650);
  assert.ok(storage.getItem(DEMO_KEY));
});

test("editing a category rate never rewrites an existing order snapshot", async () => {
  const { call } = setup();
  const order = await call("POST", "/orders", orderBody, customer);
  await call("PUT", "/admin/pricing/product/p1", { prices: [{ variant_id: "v1", category: "doctor", rate: 700 }] });
  assert.equal((await call("GET", `/admin/orders/${order.id}`)).items[0].unit_price, 650);
  assert.equal((await call("POST", "/cart/calculate", { items: orderBody.items }, customer)).items[0].unit_price, 700);
});

test("one winning offer is used without stacking special price and free units", async () => {
  const { call } = setup();
  await call("POST", "/admin/pricing/offers", { variant_id: "v1", product_id: "p1", active: true, scheme_type: "special_price", special_price: 540, min_quantity: 10, customer_type: "all", name: "Sample price" });
  const result = await call("POST", "/cart/calculate", { items: orderBody.items }, customer);
  assert.equal(result.items[0].unit_price, 540);
  assert.equal(result.items[0].free_qty, 0);
});

test("guest, pending and impersonated orders are rejected", async () => {
  const { call } = setup();
  await assert.rejects(call("POST", "/orders", orderBody, ""), e => e.status === 403);
  await assert.rejects(call("POST", "/orders", orderBody, "demo-customer:c3"), e => e.status === 403);
  await assert.rejects(call("POST", "/orders", { ...orderBody, mobile: "0000000002" }, customer), e => e.status === 403);
  await assert.rejects(call("GET", "/admin/orders", {}, customer), e => e.status === 401);
});

test("product edits and a new sample variant can be read back", async () => {
  const { call } = setup();
  const created = await call("POST", "/admin/products", { name: "Demo new product", active: true, variants: [{ pack_size: "100 ml", mrp: 300, selling_price: 200 }] });
  assert.ok(created.variants[0].id);
  await call("PUT", `/admin/products/${created.id}`, { short_description: "Edited demo description" });
  assert.equal((await call("GET", `/admin/products/${created.id}`)).short_description, "Edited demo description");
});

test("approval workflow enables a pending sample customer", async () => {
  const { call } = setup();
  await call("POST", "/admin/customers/c3/approve", {});
  const order = await call("POST", "/orders", { ...orderBody, mobile: "0000000003" }, "demo-customer:c3");
  assert.equal(order.customer_id, "c3");
});

test("dispatch details are saved and can be edited", async () => {
  const { call } = setup();
  const result = await call("POST", "/admin/orders/o1/dispatch", { cases: 2, transport_id: "tr1", freight: "paid", invoice_number: "SAMPLE-1" });
  assert.equal(result.status, "dispatched");
  assert.equal(result.dispatch.transport_name, "Demo Logistics");
  await call("POST", "/admin/orders/o1/dispatch", { cases: 2, transport_id: "tr1", lr_number: "DEMO-LR-EDIT" });
  assert.equal((await call("GET", "/admin/orders/o1")).dispatch.invoice_number, "SAMPLE-1");
});

test("quotations calculate totals and retain the company/customer snapshot", async () => {
  const { call } = setup();
  const quote = await call("POST", "/admin/quotations", { customer_id: "c1", items: [{ name: "Sample item", qty: 2, rate: 100, discount: 10, discount_type: "percent", gst: 12 }], terms: ["Demo only"] });
  assert.equal(quote.grand_total, 201.6);
  await call("PUT", "/admin/settings/company", { name: "Edited demo company" });
  assert.equal((await call("GET", `/admin/quotations/${quote.id}`)).company_snapshot.name, "VETMECH PHARMACEUTICALS PRIVATE LIMITED");
});

test("demo communications explicitly stay simulated even after settings edits", async () => {
  const { call } = setup();
  await call("PUT", "/admin/settings/whatsapp", { api_url: "https://example.com", api_key: "sample", session_id: "sample" });
  const sent = await call("POST", "/admin/whatsapp/test", { to: "0000000001", message: "Demo" });
  assert.equal(sent.simulated, true);
  assert.equal(sent.sent, false);
});

test("sample tickets can be created, replied to and closed", async () => {
  const { call } = setup();
  const ticket = await call("POST", "/tickets", { customer_id: "c1", title: "Sample support", description: "A sample issue", type: "Enquiry", priority: "medium" });
  assert.equal((await call("POST", `/tickets/${ticket.id}/reply`, { message: "Demo reply" })).delivery, "simulated");
  await call("PATCH", `/tickets/${ticket.id}/status`, { status: "closed" });
  assert.equal((await call("GET", `/tickets/${ticket.id}`)).effective_status, "closed");
});

test("a demo export is distinct from a production database backup", async () => {
  const { call } = setup();
  const backup = await call("GET", "/admin/backup/database");
  assert.equal(backup.format, "vetmech-shop-demo");
  assert.ok(backup.data.quotations.length);
  assert.ok(backup.data.category_prices.length);
});

test("reset removes only demo edits", async () => {
  const { engine, call, storage } = setup();
  storage.setItem("unrelated", "preserve me");
  await call("POST", "/admin/products", { name: "Temporary sample", variants: [] });
  engine.reset();
  assert.equal(engine.snapshot().products.length, 4);
  assert.equal(storage.getItem("unrelated"), "preserve me");
});

test("detail screens receive their required nested data contracts", async () => {
  const { call } = setup();
  const crm = await call("GET", "/crm/customers/c1");
  assert.equal(crm.stats.total, 1);
  assert.ok(Array.isArray(crm.tickets));
  assert.ok(Array.isArray(crm.activity));
  const report = await call("GET", "/tickets/reports");
  assert.equal(report.performance.total, 3);
  assert.equal((await call("GET", "/admin/pricing/offers/v1")).items.length, 1);
  assert.equal((await call("GET", "/search", {}, "", { q: "NERVIPHOS" })).results.length, 2);
});

for (const path of ["/admin/dashboard", "/admin/products", "/admin/customers", "/admin/orders", "/admin/pricing/settings", "/admin/pricing/product/p1", "/admin/pricing/customer/c1", "/admin/quotations", "/admin/quotations/dashboard", "/admin/quotations/q1", "/admin/reports/customers", "/admin/reports/summary", "/admin/seo/audit", "/admin/backup/stats", "/admin/dispatches", "/admin/transports", "/admin/users", "/admin/categories", "/admin/brands", "/units", "/crm/customers", "/tickets", "/tickets/dashboard", "/tickets/reports", "/tickets/config", "/tickets/staff", "/tickets/notifications/list", "/admin/pages", "/admin/news", "/admin/gallery", "/admin/careers", "/admin/notifications", "/admin/audit-logs"]) {
  test(`sample data contract resolves ${path}`, async () => { const { call } = setup(); const data = await call("GET", path); assert.notEqual(data, undefined); assert.ok(typeof data === "object"); });
}
