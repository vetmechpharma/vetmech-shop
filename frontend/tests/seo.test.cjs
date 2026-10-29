const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");
const { JSDOM } = require("jsdom");

const template = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const compiled = babel.transformSync(fs.readFileSync(path.join(__dirname, "../src/components/SEO.jsx"), "utf8"), {
  babelrc: false, configFile: false, plugins: ["@babel/plugin-transform-modules-commonjs"],
}).code;

const appearance = {};
vm.runInNewContext(babel.transformSync(fs.readFileSync(path.join(__dirname, "../src/lib/searchAppearance.mjs"), "utf8"), {
  babelrc: false, configFile: false, plugins: ["@babel/plugin-transform-modules-commonjs"],
}).code, { exports: appearance });

function page(env = {}) {
  const dom = new JSDOM(template, { url: "https://vetmechpharma.in/products/real-product" });
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, document: dom.window.document, window: dom.window, process: { env },
    require(name) {
      if (name === "react") return { useEffect: effect => effect() };
      if (name === "@/lib/api") return { mediaUrl: value => "https://vetmechpharma.in" + value };
      if (name === "@/lib/seo") return { siteUrl: value => "https://vetmechpharma.in" + value, ORG_NAME: "VETMECH", SITE_NAME: "VETMECH Pharmaceuticals" };
      if (name === "@/lib/searchAppearance.mjs") return appearance;
      throw Error(`Unexpected dependency ${name}`);
    },
  });
  return { document: dom.window.document, render: exports.default };
}

test("the shared SPA document does not canonicalize all routes to the homepage", () => {
  const { document } = page();
  assert.equal(document.querySelector('link[rel="canonical"]'), null);
  assert.equal(document.querySelector('meta[property="og:url"]'), null);
});

test("the route canonical wins over an old CMS URL and metadata identifies the actual product", () => {
  const { document, render } = page();
  render({ title: "Real Product", description: "Product composition information", canonical: "https://vetmechpharma.in/products/real-product",
    seo: { canonical: "https://www.vetmechpharma.in/product/old-copy/" } });
  assert.equal(document.title, "Real Product | VETMECH");
  assert.equal(document.querySelector('link[rel="canonical"]').href, "https://vetmechpharma.in/products/real-product");
  assert.equal(document.querySelector('meta[property="og:title"]').content, "Real Product | VETMECH");
  assert.equal(document.querySelector('meta[name="description"]').content, "Product composition information");
  assert.equal(document.querySelector('meta[name="robots"]').content, "index, follow, max-image-preview:large");
});

test("route changes clear the prior product image and keep private/demo pages out of search", () => {
  const { document, render } = page();
  render({ title: "Product", ogImage: "/product.webp" });
  assert.ok(document.querySelector('meta[property="og:image"]'));
  render({ title: "Partner Shop", noindex: true });
  assert.equal(document.querySelector('meta[property="og:image"]'), null);
  assert.equal(document.querySelector('meta[name="twitter:image"]'), null);
  assert.equal(document.querySelector('meta[name="robots"]').content, "noindex, follow");
  const demo = page({ REACT_APP_DEMO_MODE: "true" });
  demo.render({ title: "Sample product" });
  assert.equal(demo.document.querySelector('meta[name="robots"]').content, "noindex, nofollow");
});

test("home metadata replaces fallback identity without duplicate website nodes", () => {
  const { document, render } = page();
  render({ title: "VETMECH", jsonLd: [{ "@type": "Organization", name: "VETMECH" }, { "@type": "WebSite", name: "VETMECH Pharmaceuticals" }] });
  assert.equal(document.querySelector('meta[property="og:site_name"]').content, "VETMECH Pharmaceuticals");
  const nodes = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(script => JSON.parse(script.textContent));
  assert.equal(nodes.filter(node => node["@type"] === "WebSite").length, 1);
  assert.equal(nodes.filter(node => node["@type"] === "Organization").length, 1);
});

test("search appearance hides only the starter address and preserves robots restrictions", async () => {
  const { companyAddress, searchRobots } = await import("../src/lib/searchAppearance.mjs");
  assert.equal(companyAddress("Plot 42, Pharma Industrial Estate, Ahmedabad, Gujarat 382210, India"), "");
  assert.equal(companyAddress("Verified office address"), "Verified office address");
  assert.equal(searchRobots(), "index, follow, max-image-preview:large");
  for (const value of ["noindex, follow", "noimageindex", "nosnippet", "index, max-image-preview:none"]) assert.equal(searchRobots(value), value);
});

test("the homepage declares a square raster brand icon with a real public asset", () => {
  const { document } = page();
  const icon = document.querySelector('link[rel="icon"]');
  assert.equal(icon.getAttribute("type"), "image/png");
  const data = fs.readFileSync(path.join(__dirname, "../public", icon.getAttribute("href").replace("%PUBLIC_URL%/", "")));
  assert.equal(data.subarray(1,4).toString(), "PNG");
  assert.equal(data.readUInt32BE(16), 96);
  assert.equal(data.readUInt32BE(20), 96);
});
