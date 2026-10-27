import test from "node:test";
import assert from "node:assert/strict";
import { createDemoEngine } from "../src/demo/engine.mjs";
import { randomRelatedProducts, relatedProductsFor } from "../src/lib/relatedProducts.mjs";

const product = (id, extra = {}) => ({ id, slug: id, name: id, active: true, variants: [], ...extra });

test("related products randomly sample all category matches with a hard limit of four", () => {
  const current = product("current", { category_id: "cattle", related_product_ids: ["inactive"] });
  const candidates = Array.from({ length: 10 }, (_, i) => product(`p${i}`, { category_ids: ["cattle"] }));
  const rows = [current, product("inactive", { active: false }), ...candidates];
  const first = randomRelatedProducts(current, rows, () => 0);
  const second = randomRelatedProducts(current, rows, () => 0.999);
  assert.equal(first.length, 4);
  assert.equal(second.length, 4);
  assert.notDeepEqual(first.map(p => p.id), second.map(p => p.id));
  assert.equal(new Set(first.map(p => p.id)).size, 4);
  assert.ok(first.every(p => p.id !== current.id && p.active));
});

test("category matches come first and remaining spaces use other active products", () => {
  const current = product("current", { category_id: "cattle", category_ids: ["poultry"] });
  const rows = [product("primary", { category_id: "cattle" }), product("secondary", { category_ids: ["poultry"] }),
    ...Array.from({ length: 6 }, (_, i) => product(`other${i}`)), product("primary", { category_id: "cattle" })];
  const result = randomRelatedProducts(current, rows, () => 0);
  assert.deepEqual(new Set(result.slice(0, 2).map(p => p.id)), new Set(["primary", "secondary"]));
  assert.equal(result.length, 4);
  assert.equal(new Set(result.map(p => p.id)).size, 4);
  assert.deepEqual(randomRelatedProducts(current, []), []);
  assert.equal(randomRelatedProducts(product("uncategorised"), rows).length, 4);
  assert.equal(randomRelatedProducts(current, rows.slice(0, 2)).length, 2);
});

test("related cards exclude the current product, inactive entries and duplicates even with an older API", () => {
  const current = product("current");
  const related = [current, product("inactive", { active: false }), null, product("missing-slug", { slug: "" }),
    ...Array.from({ length: 9 }, (_, i) => product(`p${i}`)), product("p1")];
  assert.deepEqual(relatedProductsFor({ ...current, related }).map(p => p.id), ["p0", "p1", "p2", "p3"]);
});

test("demo includes newly added products automatically and keeps the same four-item limit", async () => {
  const memory = new Map();
  const engine = createDemoEngine({ getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) });
  const call = (method, path, body, token = "demo-admin") => engine.handle({ method, path, body, token });
  const current = await call("POST", "/admin/products", product("", { name: "Category test", slug: "category-test", category_id: "unique-category" }));
  const added = await call("POST", "/admin/products", product("", { name: "Automatic related product", slug: "automatic-related", category_ids: ["unique-category"] }));
  const response = await call("GET", `/products/${current.slug}`, undefined, "");
  assert.equal(response.related[0].id, added.id);
  assert.equal(response.related.length, 4);
  assert.deepEqual(response.related_products, response.related);
  assert.ok(response.related.every(p => p.id !== current.id));
  await call("PUT", `/admin/products/${added.id}`, { active: false });
  const updated = await call("GET", `/products/${current.slug}`, undefined, "");
  assert.equal(updated.related.length, 4);
  assert.ok(updated.related.every(p => p.id !== added.id));
  await assert.rejects(call("GET", `/products/${added.slug}`, undefined, ""), error => error.status === 404);
});
