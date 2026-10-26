const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, readFile, writeFile, rm, access } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { JSDOM } = require("jsdom");

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vetmech-demo-metadata-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "index.html"), await readFile(path.join(__dirname, "../public/index.html"), "utf8"));
  return directory;
}

test("published demo Shop and portfolio HTML expose the actual product preview before JavaScript runs", async t => {
  const { writeDemoMetadata } = await import("../scripts/demo-metadata.mjs");
  const { seedDemo } = await import("../src/demo/seed.mjs");
  const buildDirectory = await fixture(t), products = seedDemo().products;
  const pages = await writeDemoMetadata({ buildDirectory, products, siteUrl: "https://demo.example.test" });
  assert.equal(pages.length, products.length * 2);
  const product = products.find(value => value.slug.startsWith("quino-taz-"));
  await access(path.join(__dirname, "../public", product.seo.og_image));
  for (const prefix of ["products", "shop/products"]) {
    const html = await readFile(path.join(buildDirectory, prefix, product.slug, "index.html"), "utf8");
    const document = new JSDOM(html).window.document;
    assert.match(document.title, /^QUINO-TAZ 562\.5 mg/);
    assert.equal(document.querySelectorAll('meta[property="og:title"]').length, 1);
    assert.equal(document.querySelector('meta[property="og:title"]').content, document.title);
    assert.equal(document.querySelector('meta[property="og:description"]').content, product.seo.meta_description);
    assert.equal(document.querySelector('meta[property="og:image"]').content, "https://demo.example.test/demo/quino-taz-share.jpg");
    assert.equal(document.querySelector('meta[name="twitter:image"]').content, "https://demo.example.test/demo/quino-taz-share.jpg");
    assert.equal(document.querySelector('link[rel="canonical"]').href, `https://demo.example.test/products/${product.slug}`);
    assert.equal(document.querySelector('meta[name="robots"]').content, "noindex, nofollow");
    assert.equal(html.includes("selling_price"), false);
  }
});

test("demo fallback remains noindex when an origin is omitted, and inactive records are not published", async t => {
  const { writeDemoMetadata } = await import("../scripts/demo-metadata.mjs");
  const buildDirectory = await fixture(t);
  assert.deepEqual(await writeDemoMetadata({ buildDirectory, products: [] }), []);
  const document = new JSDOM(await readFile(path.join(buildDirectory, "index.html"), "utf8")).window.document;
  assert.equal(document.querySelector('meta[name="robots"]').content, "noindex, nofollow");
  assert.deepEqual(await writeDemoMetadata({ buildDirectory, siteUrl: "https://demo.example.test", products: [{ active: false, slug: "hidden-product" }] }), []);
});

test("generated metadata escapes content, ignores unsafe/vector images and prevents output path traversal", async t => {
  const { writeDemoMetadata } = await import("../scripts/demo-metadata.mjs");
  const buildDirectory = await fixture(t);
  const product = { name: 'Product "A" & B', slug: "safe-product", short_description: 'Label <script>alert(1)</script> & "details"', seo: { og_image: "javascript:alert(1)" }, image: "/placeholder.svg", images: ["/real-image.png"] };
  await writeDemoMetadata({ buildDirectory, siteUrl: "https://demo.example.test", products: [product] });
  const document = new JSDOM(await readFile(path.join(buildDirectory, "shop/products/safe-product/index.html"), "utf8")).window.document;
  assert.equal(document.title, 'Product "A" & B | VETMECH');
  assert.equal(document.querySelector('meta[property="og:image"]').content, "https://demo.example.test/real-image.png");
  assert.equal(document.querySelector('meta[name="description"]').content, 'Label & "details"');
  assert.equal(document.querySelectorAll("script:not([type='application/ld+json'])").length, 0);
  await assert.rejects(writeDemoMetadata({ buildDirectory, siteUrl: "https://demo.example.test", products: [{ slug: "../../escape" }] }), /unsafe/);
  await assert.rejects(writeDemoMetadata({ buildDirectory, siteUrl: "https://demo.example.test/wrong-base", products: [] }), /origin/);
});
