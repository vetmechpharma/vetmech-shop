import test from "node:test";
import assert from "node:assert/strict";
import { createDemoEngine } from "../src/demo/engine.mjs";

const setup = () => {
  const values = new Map(), storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const engine = createDemoEngine(storage);
  return (path, body = {}, token = "", method = "POST") => engine.handle({ method, path, body, token });
};
const details = { name: "Sample Signup", mobile: "0000000011", password: "Signup@2026", category: "doctor", license_number: "SAMPLE-ONLY" };
async function verify(call, mobile = details.mobile) {
  await call("/auth/otp/request", { mobile });
  return (await call("/auth/otp/verify", { mobile, otp: "123456" })).verification_token;
}

test("demo registration requires mobile proof and mandatory password", async () => {
  const call = setup();
  await assert.rejects(call("/auth/register", details), error => error.status === 400);
  const verification_token = await verify(call);
  await assert.rejects(call("/auth/register", { ...details, password: "", verification_token }), error => error.status === 400);
  const signup = await call("/auth/register", { ...details, verification_token });
  assert.equal(signup.status, "pending");
  const login = await call("/auth/login/password", { mobile: details.mobile, password: details.password });
  assert.ok(login.token);
  assert.equal(login.customer.password, undefined);
  assert.equal(login.customer.has_password, true);
  assert.equal(login.customer.status, "pending");
});

test("demo OTP cannot log in an existing customer or be replayed", async () => {
  const call = setup();
  await assert.rejects(call("/auth/otp/request", { mobile: "0000000001" }), error => error.status === 409);
  await assert.rejects(call("/auth/otp/verify", { mobile: "0000000001", otp: "123456" }), error => error.status === 409);
  const verification_token = await verify(call);
  assert.ok(verification_token);
  await assert.rejects(call("/auth/otp/verify", { mobile: details.mobile, otp: "123456" }), error => error.status === 400);
  await assert.rejects(call("/auth/register", { ...details, mobile: "0000000012", verification_token }), error => error.status === 400);
  await call("/auth/register", { ...details, verification_token });
  await assert.rejects(call("/auth/register", { ...details, verification_token }), error => error.status === 409);
});

test("demo resend invalidates earlier proof and respects request limits", async () => {
  const call = setup();
  const first = await verify(call), second = await verify(call);
  await assert.rejects(call("/auth/register", { ...details, verification_token: first }), error => error.status === 400);
  assert.notEqual(first, second);
  for (let i = 0; i < 3; i++) await call("/auth/otp/request", { mobile: details.mobile });
  await assert.rejects(call("/auth/otp/request", { mobile: details.mobile }), error => error.status === 429);
});

test("demo password reset enables password login and preserves blocked status", async () => {
  const call = setup();
  await assert.rejects(call("/admin/customers/c1/reset-password", { password: "short" }, "demo-admin"), error => error.status === 400);
  await call("/admin/customers/c1/reset-password", { password: "Changed@2026" }, "demo-admin");
  assert.ok((await call("/auth/login/password", { mobile: "0000000001", password: "Changed@2026" })).token);
  await call("/admin/customers/c1/suspend", {}, "demo-admin");
  await assert.rejects(call("/auth/login/password", { mobile: "0000000001", password: "Changed@2026" }), error => error.status === 403);
});

test("demo customer deletion moves the record to Deleted and preserves history", async () => {
  const call = setup();
  const before = await call("/admin/customers/c1", {}, "demo-admin", "GET");
  await call("/admin/customers/c1", {}, "demo-admin", "DELETE");
  const listing = await call("/admin/customers", {}, "demo-admin", "GET");
  assert.equal(listing.items.some(customer => customer.id === "c1"), false);
  const deleted = await call("/admin/customers?status=deleted", {}, "demo-admin", "GET");
  assert.deepEqual(deleted.items.map(customer => customer.id), ["c1"]);
  const after = await call("/admin/customers/c1", {}, "demo-admin", "GET");
  assert.equal(after.active, false);
  assert.deepEqual(after.orders, before.orders);
  await assert.rejects(call("/auth/customer/me", {}, "demo-customer:c1", "GET"), error => error.status === 401);
});
