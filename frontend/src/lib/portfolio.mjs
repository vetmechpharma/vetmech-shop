// Corporate views receive an information-only projection, including for signed-in customers.
const PRODUCT_FIELDS = ["id", "name", "slug", "product_code", "generic_name", "brand_name", "category_id", "subcategory_id", "category_ids", "subcategory_ids", "image", "images", "short_description", "full_description", "composition", "indications", "dosage", "benefits", "precautions", "storage", "additional_info", "brochure_url", "pdf_url"];
const SEO_FIELDS = ["title", "meta_description", "meta_keywords", "og_title", "og_description", "og_image", "faqs", "intro", "extra_content"];
const select = (object, keys) => Object.fromEntries(keys.filter(key => object?.[key] !== undefined).map(key => [key, object[key]]));

export function portfolioProduct(product = {}) {
  return {
    ...select(product, PRODUCT_FIELDS),
    category: product.category ? select(product.category, ["id", "name", "slug"]) : undefined,
    variants: (product.variants || []).map(variant => select(variant, ["id", "pack_size", "unit", "sku", "images"])),
    seo: select(product.seo || {}, SEO_FIELDS),
  };
}

export function portfolioText(value) {
  return String(value || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?\s*>|<\/p>|<\/li>/gi, "\n").replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

export function portfolioJsonLd(product, url, image) {
  const p = portfolioProduct(product);
  return { "@context": "https://schema.org", "@type": "Product", name: p.name, description: portfolioText(p.short_description || p.composition),
    image, url, brand: { "@type": "Brand", name: p.brand_name || "VETMECH" }, sku: p.product_code || p.variants[0]?.sku || undefined };
}

export function speciesCategory(species, categories = []) {
  const terms = { cattle: ["cattle", "buffalo", "large animal", "livestock"], sheep: ["sheep", "goat", "ruminant", "large animal"], poultry: ["poultry", "avian", "bird"], companion: ["companion", "small animal", "pet"] };
  const needles = terms[species] || [];
  return categories.find(category => needles.some(term => `${category.name || ""} ${category.slug || ""}`.toLowerCase().replaceAll("-", " ").includes(term)))?.slug || null;
}
