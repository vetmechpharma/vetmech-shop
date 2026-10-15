const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

function loadApi(env) {
  let interceptor;
  const source = fs.readFileSync(path.join(__dirname, "../src/lib/api.js"), "utf8");
  const compiled = babel.transformSync(source, { babelrc: false, configFile: false,
    plugins: ["@babel/plugin-transform-modules-commonjs"] }).code;
  const exports = {};
  const context = { exports, URL, process: { env }, window: { location: { origin: "https://copy.example.com" } },
    localStorage: { getItem: (key) => key === "vm_admin_token" ? "admin-token" : "customer-token" },
    require: () => ({ create: (config) => ({ ...config, interceptors: { request: { use: (fn) => { interceptor = fn; } } } }) }) };
  vm.runInNewContext(compiled, context);
  return { ...exports, request: (url) => interceptor({ url, headers: {} }) };
}

test("a copied site works on its own origin without frontend environment configuration", () => {
  const api = loadApi({});
  assert.equal(api.API_BASE, "/api");
  assert.equal(api.mediaUrl("/api/uploads/logo.png"), "/api/uploads/logo.png");
  assert.equal(api.absoluteApiUrl("/whatsapp/webhook"), "https://copy.example.com/api/whatsapp/webhook");
});

test("a separately hosted backend has normalized URLs", () => {
  const api = loadApi({ REACT_APP_BACKEND_URL: " https://api.example.com/// " });
  assert.equal(api.API_BASE, "https://api.example.com/api");
  assert.equal(api.mediaUrl("/api/uploads/logo.png"), "https://api.example.com/api/uploads/logo.png");
});

test("admin and customer requests use their separate login sessions", () => {
  const api = loadApi({});
  assert.equal(api.request("/admin/backup/database").headers.Authorization, "Bearer admin-token");
  assert.equal(api.request("/orders").headers.Authorization, "Bearer customer-token");
});
