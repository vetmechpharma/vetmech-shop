import { useEffect } from "react";
import { api } from "@/lib/api";

// Injects Google Analytics / GTM + Search Console verification from admin SEO settings.
export default function SeoGlobals() {
  useEffect(() => {
    let cancelled = false;
    api.get("/settings/seo").then(({ data }) => {
      if (cancelled || !data) return;
      const gaId = (data.ga_id || "").trim();
      const gtmId = (data.gtm_id || "").trim();
      const verify = (data.gsc_verification || "").trim();

      if (verify && !document.querySelector('meta[name="google-site-verification"]')) {
        const m = document.createElement("meta");
        m.name = "google-site-verification";
        m.content = verify;
        document.head.appendChild(m);
      }
      if (gaId && !window.__vmGaLoaded) {
        window.__vmGaLoaded = true;
        const s = document.createElement("script");
        s.async = true;
        s.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
        document.head.appendChild(s);
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag("js", new Date());
        window.gtag("config", gaId);
      }
      if (gtmId && !window.__vmGtmLoaded) {
        window.__vmGtmLoaded = true;
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
        const j = document.createElement("script");
        j.async = true;
        j.src = `https://www.googletagmanager.com/gtm.js?id=${gtmId}`;
        document.head.appendChild(j);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return null;
}
