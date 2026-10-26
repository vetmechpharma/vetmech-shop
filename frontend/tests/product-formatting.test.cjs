const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { JSDOM } = require("jsdom");
const babel = require("@babel/core");

async function content(value, kind) {
  const formatting = await import("../src/lib/productFormatting.mjs");
  const portfolio = await import("../src/lib/portfolio.mjs");
  const code = babel.transformSync(fs.readFileSync(path.join(__dirname, "../src/components/corporate/ProductContent.jsx"), "utf8"), {
    babelrc: false, configFile: false, presets: [["@babel/preset-react", { runtime: "classic" }]], plugins: ["@babel/plugin-transform-modules-commonjs"],
  }).code;
  const exports = {};
  vm.runInNewContext(code, { exports, DOMParser: new JSDOM("").window.DOMParser, URL,
    require(name) {
      if (name === "react") return React;
      if (name === "@/lib/portfolio.mjs") return portfolio;
      if (name === "@/lib/productFormatting.mjs") return formatting;
      throw Error(`Unexpected dependency ${name}`);
    },
  });
  return renderToStaticMarkup(React.createElement(exports.default, { value, kind }));
}

test("composition formatting preserves labels, component quantities and separate vial groups", async () => {
  const { compositionGroups } = await import("../src/lib/productFormatting.mjs");
  const value = "Vial A — Product\nEach vial contains:\nCefquinome Sulphate\nequivalent to Cefquinome ........ 500 mg\nTazobactam ........ 62.5 mg\nVial B — Solvent\nSodium Bicarbonate Solvent ........ 20 mL";
  const groups = compositionGroups(value);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].rows, [{ label: "Cefquinome Sulphate equivalent to Cefquinome", value: "500 mg" }, { label: "Tazobactam", value: "62.5 mg" }]);
  assert.equal(groups[1].rows[0].value, "20 mL");
  const html = await content(value, "composition");
  assert.ok(html.includes("<dl>") && html.includes("Vial B — Solvent") && html.includes("62.5 mg"));
});

test("dosage lines retain the supplied species, units and routes without interpretation", async () => {
  const value = "Cattle, Buffalo & Horse: 1 mg Cefquinome/kg body weight IM /IV\nSheep, Goat & Pig:2 mg Cefquinome/kg body weight IM /IV";
  const { labelledLines } = await import("../src/lib/productFormatting.mjs");
  assert.equal(labelledLines(value)[1].value, "2 mg Cefquinome/kg body weight IM /IV");
  assert.deepEqual(labelledLines("Use as directed."), []);
  const html = await content(value, "dosage");
  assert.ok(html.includes("<dt>Cattle, Buffalo &amp; Horse</dt>"));
  assert.ok(html.includes("1 mg Cefquinome/kg body weight IM /IV"));
});

test("HTML tables and lists keep their structure while scripts, event handlers and unsafe URLs are removed", async () => {
  const html = await content('<script>alert(1)</script><h1>Composition</h1><table>\n<tbody><tr><th>Ingredient</th><td>500 mg</td></tr></tbody></table><ul><li><strong>Keep formatting</strong></li></ul><a href="javascript:alert(1)">Unsafe link</a><img src="https://example.com/product.png" onerror="alert(1)" alt="Product"/><style>body{display:none}</style>');
  assert.ok(html.includes("<table>") && html.includes("<td>500 mg</td>") && html.includes("<strong>Keep formatting</strong>"));
  assert.ok(html.includes("<h4>Composition</h4>") && html.includes('alt="Product"'));
  for (const token of ["<script", "onerror", "javascript:", "<style", "alert(1)"]) assert.equal(html.includes(token), false, token);
});

test("plain paragraphs, bullet lists and bold text are readable without exposing raw markup", async () => {
  const html = await content("## Product overview\nFirst paragraph.\nSecond paragraph.\n- **One** point\n- Two points");
  assert.ok(html.includes("<h4>Product overview</h4>") && html.includes("<p>Second paragraph.</p>") && html.includes("<ul>") && html.includes("<strong>One</strong>"));
});

test("gallery includes unique product and selected-variant images with predictable priority", async () => {
  const { productImages, safeContentUrl } = await import("../src/lib/productFormatting.mjs");
  const product = { image: "/main.webp", images: ["", "/main.webp"], variants: [{ images: ["/pack.webp"] }] };
  assert.deepEqual(productImages(product), ["/main.webp", "/pack.webp"]);
  assert.deepEqual(productImages(product, product.variants[0]), ["/pack.webp", "/main.webp"]);
  assert.equal(safeContentUrl("javascript:alert(1)"), null);
  assert.equal(safeContentUrl("data:text/html,test"), null);
  assert.equal(safeContentUrl("/api/uploads/literature.pdf"), "/api/uploads/literature.pdf");
});
