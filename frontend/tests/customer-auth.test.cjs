const test = require("node:test");
const assert = require("node:assert/strict");

test("signup password validation handles missing values and bcrypt byte boundaries", async () => {
  const { passwordError } = await import("../src/lib/customerAuth.mjs");
  for (const value of [undefined, null, "", "short", "        ", "é".repeat(37), "a".repeat(73)]) assert.ok(passwordError(value));
  assert.equal(passwordError("Secure@2026"), "");
  assert.equal(passwordError("é".repeat(36)), "");
});

test("account return URLs stay within this website", async () => {
  const { safeReturnPath } = await import("../src/lib/customerAuth.mjs");
  for (const url of [null, "https://example.com", "//example.com", "/" + String.fromCharCode(92) + "example.com", "javascript:alert(1)", "/ /example.com"]) assert.equal(safeReturnPath(url), "/shop");
  assert.equal(safeReturnPath("/checkout"), "/checkout");
  assert.equal(safeReturnPath("/shop?q=test"), "/shop?q=test");
});

test("admin navigation chooses only the deepest matching destination", async () => {
  const { currentAdminDestination } = await import("../src/lib/adminNavigation.mjs");
  const groups = [{ single: true, to: "/admin", end: true }, { children: [{ to: "/admin/customers" }, { to: "/admin/customers/reports" }, { to: "/admin/settings" }, { to: "/admin/settings/homepage" }] }];
  assert.equal(currentAdminDestination(groups, "/admin/customers/reports").to, "/admin/customers/reports");
  assert.equal(currentAdminDestination(groups, "/admin/settings/homepage").to, "/admin/settings/homepage");
  assert.equal(currentAdminDestination(groups, "/admin/customers/abc").to, "/admin/customers");
  assert.equal(currentAdminDestination(groups, "/admin/customersevil"), null);
});
