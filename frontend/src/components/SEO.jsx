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

export default function SEO({ title, description, keywords, ogImage, seo }) {
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
    if (img) setMeta("og:image", mediaUrl(img), "property");
  }, [title, description, keywords, ogImage, seo]);
  return null;
}
