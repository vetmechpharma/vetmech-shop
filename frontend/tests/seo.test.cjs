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

function page(env = {}) {
  const dom = new JSDOM(template, { url: "https://vetmechpharma.in/products/real-product" });
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, document: dom.window.document, window: dom.window, process: { env },
    require(name) {
      if (name === "react") return { useEffect: effect => effect() };
      if (name === "@/lib/api") return { mediaUrl: value => "https://vetmechpharma.in" + value };
      if (name === "@/lib/seo") return { siteUrl: value => "https://vetmechpharma.in" + value, ORG_NAME: "VETMECH" };
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
  assert.equal(document.querySelector('meta[name="robots"]').content, "index, follow");
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
