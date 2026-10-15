import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { installDemoAdapter, makeDemoPdf } from "../src/demo/adapter.js";

test("the Axios demo adapter keeps edits and notifications off the network", async () => {
  const memory = new Map();
  let network = 0;
  globalThis.window = { location: { origin: "https://demo.example" }, localStorage: { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) }, fetch: async () => { network++; throw new Error("Unexpected network call"); } };
  const client = axios.create();
  installDemoAdapter(client);
  const login = await client.post("/auth/admin/login", { email: "demo@vetmech.local", password: "Demo@123" });
  assert.equal(login.data.token, "demo-admin");
  client.defaults.headers.common.Authorization = "Bearer demo-admin";
  await client.put("/admin/settings/whatsapp", { api_url: "https://example.com", api_key: "sample", session_id: "sample" });
  const result = await client.post("/admin/whatsapp/test", { to: "0000000001", message: "Sample only" });
  assert.equal(result.data.simulated, true);
  assert.equal(network, 0);
  const backup = await window.fetch("/api/admin/backup/database", { headers: { Authorization: "Bearer demo-admin" } });
  assert.equal((await backup.json()).format, "vetmech-shop-demo");
  assert.equal(network, 0);
  assert.ok(memory.size);
  await assert.rejects(client.post("/auth/admin/login", { email: "demo@vetmech.local", password: "wrong" }), error => error.response.status === 401);
});

test("demo quotation PDF is a complete PDF with escaped content and valid xref offset", async () => {
  const pdf = makeDemoPdf(["VETMECH sample quotation", "Item (sample)", "Total: INR 2912"]);
  assert.equal(pdf.type, "application/pdf");
  const text = await pdf.text();
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.endsWith("%%EOF"));
  assert.ok(text.includes("Item \\(sample\\)"));
  const start = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(text.slice(start, start + 4), "xref");
});
