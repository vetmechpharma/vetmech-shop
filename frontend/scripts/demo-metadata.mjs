import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { portfolioText } from "../src/lib/portfolio.mjs";

const ORG_NAME = "VETMECH PHARMACEUTICALS PRIVATE LIMITED";
const escape = value => String(value || "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const text = value => portfolioText(value).replace(/\s+/g, " ").trim();

function documentWithMetadata(html, { title, description, canonical, image, product = false }) {
  const socialTitle = title.includes("VETMECH") ? title : `${title} | VETMECH`;
  const meta = (name, value, attribute = "name") => value ? `<meta ${attribute}="${name}" content="${escape(value)}"/>` : "";
  const tags = [
    `<title>${escape(socialTitle)}</title>`,
    meta("description", description), meta("robots", "noindex, nofollow"),
    meta("og:site_name", ORG_NAME, "property"), meta("og:type", product ? "product" : "website", "property"),
    meta("og:title", socialTitle, "property"), meta("og:description", description, "property"),
    meta("og:url", canonical, "property"), meta("og:image", image, "property"), meta("og:image:alt", image ? title : "", "property"),
    meta("twitter:card", image ? "summary_large_image" : "summary"), meta("twitter:title", socialTitle),
    meta("twitter:description", description), meta("twitter:image", image),
    canonical ? `<link rel="canonical" href="${escape(canonical)}"/>` : "",
  ].filter(Boolean).join("\n");
  return html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\b(?=[^>]*\b(?:name|property)\s*=\s*["'](?:description|robots|og:[^"']+|twitter:[^"']+)["'])[^>]*>/gi, "")
    .replace(/<link\b(?=[^>]*\brel\s*=\s*["']canonical["'])[^>]*>/gi, "")
    .replace(/<\/head>/i, `${tags}\n</head>`);
}

function imageUrl(product, origin) {
  const candidates = [product.seo?.og_image, product.image, ...(product.images || []), ...(product.variants || []).flatMap(variant => variant.images || [])];
  for (const candidate of candidates.filter(Boolean)) {
    try {
      const url = new URL(candidate, origin);
      // Vector placeholders are useful in the app but not for social thumbnails.
      if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password && !/\.svg$/i.test(url.pathname)) return url.href;
    } catch { /* Ignore invalid source URLs. */ }
  }
  return "";
}

export async function writeDemoMetadata({ buildDirectory, siteUrl, products }) {
  let origin = "";
  if (siteUrl) {
    const parsed = new URL(siteUrl);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error("The demo site URL must be an HTTP(S) origin.");
    origin = parsed.origin;
  }
  const template = await readFile(path.join(buildDirectory, "index.html"), "utf8");
  if (!/<\/head>/i.test(template)) throw new Error("The demo build is missing its HTML head.");
  await writeFile(path.join(buildDirectory, "index.html"), documentWithMetadata(template, {
    title: "VETMECH Shop | Development Demo", description: "Explore the VETMECH development demo with sample products and simulated orders.", canonical: origin ? `${origin}/` : "",
  }));
  if (!origin) return [];
  const pages = [];
  for (const product of products.filter(value => value.active !== false)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug || "")) throw new Error("A demo product has an unsafe or missing slug.");
    const seo = product.seo || {};
    const metadata = {
      title: text(seo.og_title || seo.title || product.name),
      description: text(seo.og_description || seo.meta_description || product.short_description || product.composition),
      canonical: `${origin}/products/${product.slug}`, image: imageUrl(product, origin), product: true,
    };
    for (const prefix of ["products", "shop/products"]) {
      const directory = path.join(buildDirectory, prefix, product.slug);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "index.html"), documentWithMetadata(template, metadata));
      pages.push(`/${prefix}/${product.slug}`);
    }
  }
  return pages;
}
