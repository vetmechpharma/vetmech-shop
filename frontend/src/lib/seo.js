// Shared SEO / JSON-LD helpers (reused across product, category, news, home).
import { mediaUrl } from "@/lib/api";
import { SITE_NAME, SITE_ALTERNATE_NAMES, companyAddress } from "./searchAppearance.mjs";
export { SITE_NAME } from "./searchAppearance.mjs";

const SITE_URL = (process.env.REACT_APP_SITE_URL || window.location.origin).replace(/\/$/, "");
export const ORG_NAME = "VETMECH PHARMACEUTICALS PRIVATE LIMITED";

export function siteUrl(path = "") {
  if (/^https?:\/\//i.test(path)) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${p}`;
}

// items: [{ name, path }] — path is relative or absolute
export function breadcrumbLd(items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: list.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: siteUrl(it.path),
    })),
  };
}

// faqs: [{ q, a }]
export function faqLd(faqs) {
  const list = (faqs || []).filter((f) => f && f.q && f.a);
  if (!list.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: list.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function articleLd({ title, description, image, datePublished, dateModified, author, path }) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    datePublished,
    dateModified: dateModified || datePublished,
    author: { "@type": author ? "Person" : "Organization", name: author || ORG_NAME },
    publisher: { "@type": "Organization", name: ORG_NAME, logo: { "@type": "ImageObject", url: siteUrl("/corporate/brand.svg") } },
    mainEntityOfPage: siteUrl(path),
  };
  if (image) ld.image = [mediaUrl(image)];
  return ld;
}

export function organizationLd(company, extra = {}) {
  const social = company?.social ? Object.values(company.social).filter((u) => u && u !== "#") : [];
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: company?.name || ORG_NAME,
    alternateName: [SITE_NAME, "VETMECH"],
    "@id": siteUrl("/#organization"),
    url: SITE_URL || undefined,
    logo: company?.logo ? mediaUrl(company.logo) : siteUrl("/corporate/brand.svg"),
    ...(company?.phone ? { telephone: company.phone } : {}),
    ...(company?.email ? { email: company.email } : {}),
    ...(companyAddress(company?.address) ? { address: { "@type": "PostalAddress", streetAddress: companyAddress(company.address) } } : {}),
    ...(social.length ? { sameAs: social } : {}),
    ...extra,
  };
}

export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": siteUrl("/#website"),
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAMES,
    url: SITE_URL || undefined,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl("/products")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}
