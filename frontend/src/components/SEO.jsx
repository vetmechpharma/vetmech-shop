import { useEffect } from "react";
import { mediaUrl } from "@/lib/api";
import { siteUrl, ORG_NAME } from "@/lib/seo";

function setMeta(name, content, attr = "name") {
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!content) {
    if (el && el.dataset.vm === "1") el.remove();
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    el.dataset.vm = "1";
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
  const arr = Array.isArray(data) ? data.filter(Boolean) : [data];
  if (!arr.length) return;
  const s = document.createElement("script");
  s.type = "application/ld+json";
  s.id = id;
  s.text = JSON.stringify(arr.length === 1 ? arr[0] : arr);
  document.head.appendChild(s);
}

export default function SEO({ title, description, keywords, ogImage, seo, jsonLd, canonical, ogType = "website", noindex = false }) {
  useEffect(() => {
    const t = seo?.title || title;
    const d = seo?.meta_description || seo?.description || description;
    const k = seo?.meta_keywords || seo?.keywords || keywords;
    const img = seo?.og_image || ogImage;
    document.title = t ? (t.includes("VETMECH") ? t : `${t} | VETMECH`) : ORG_NAME;
    setMeta("description", d);
    setMeta("keywords", k);
    setMeta("robots", noindex ? "noindex, nofollow" : (seo?.robots || "index, follow"));
    setMeta("og:site_name", ORG_NAME, "property");
    setMeta("og:title", seo?.og_title || t, "property");
    setMeta("og:description", seo?.og_description || d, "property");
    setMeta("og:type", ogType, "property");
    if (img) setMeta("og:image", mediaUrl(img), "property");
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", seo?.og_title || t);
    setMeta("twitter:description", seo?.og_description || d);
    if (img) setMeta("twitter:image", mediaUrl(img));
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    const canon = seo?.canonical || canonical || siteUrl(path);
    setCanonical(canon);
    setMeta("og:url", canon, "property");
    setJsonLd("vm-jsonld", jsonLd);
    return () => setJsonLd("vm-jsonld", null);
  }, [title, description, keywords, ogImage, seo, jsonLd, canonical, ogType, noindex]);
  return null;
}
