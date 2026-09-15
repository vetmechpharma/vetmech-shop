import { useEffect } from "react";
import { mediaUrl } from "@/lib/api";

function setMeta(name, content, attr = "name") {
  if (!content) return;
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href) {
  if (!href) return;
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function setJsonLd(id, data) {
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  if (!data) return;
  const s = document.createElement("script");
  s.type = "application/ld+json";
  s.id = id;
  s.text = JSON.stringify(data);
  document.head.appendChild(s);
}

export default function SEO({ title, description, keywords, ogImage, seo, jsonLd, canonical }) {
  useEffect(() => {
    const t = seo?.title || title;
    const d = seo?.meta_description || seo?.description || description;
    const k = seo?.meta_keywords || seo?.keywords || keywords;
    const img = seo?.og_image || ogImage;
    if (t) document.title = t.includes("VETMECH") ? t : `${t} | VETMECH`;
    setMeta("description", d);
    setMeta("keywords", k);
    setMeta("og:title", seo?.og_title || t, "property");
    setMeta("og:description", seo?.og_description || d, "property");
    setMeta("og:type", "website", "property");
    if (img) setMeta("og:image", mediaUrl(img), "property");
    setMeta("twitter:card", "summary_large_image");
    const canon = canonical || (typeof window !== "undefined" ? window.location.href.split("?")[0] : "");
    setCanonical(canon);
    setMeta("og:url", canon, "property");
    setJsonLd("vm-jsonld", jsonLd);
    return () => setJsonLd("vm-jsonld", null);
  }, [title, description, keywords, ogImage, seo, jsonLd, canonical]);
  return null;
}
