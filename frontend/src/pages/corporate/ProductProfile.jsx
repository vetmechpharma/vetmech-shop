import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ArrowUpRight, Package, Expand, ChevronDown } from "lucide-react";
import { api, mediaUrl } from "@/lib/api";
import { portfolioProduct, portfolioJsonLd, portfolioText } from "@/lib/portfolio.mjs";
import { productImages } from "@/lib/productFormatting.mjs";
import SEO from "@/components/SEO";
import ShareButtons from "@/components/public/ShareButtons";
import { siteUrl, breadcrumbLd, faqLd } from "@/lib/seo";
import { ActionLink, Partnership, EmptyPortfolio } from "@/components/corporate/Shared";
import ProductContent from "@/components/corporate/ProductContent";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import "@/components/corporate/product-profile.css";

export default function ProductProfile() {
  const { slug } = useParams();
  const [variantId, setVariantId] = useState(""), [imageIndex, setImageIndex] = useState(0), [zoom, setZoom] = useState(false);
  useEffect(() => { setVariantId(""); setImageIndex(0); setZoom(false); }, [slug]);
  const { data: p, isPending, isError, error, refetch } = useQuery({
    queryKey: ["corporate-product", slug], queryFn: async () => portfolioProduct((await api.get(`/products/${slug}`)).data),
  });
  const sections = useMemo(() => p ? [
    { id: "composition", title: "Composition", note: "Formulation details", value: p.composition },
    { id: "overview", title: "Product overview", note: "About this formulation", value: p.full_description },
    { id: "indications", title: "Indications", note: "Product uses", value: p.indications },
    { id: "dosage", title: "Dosage & administration", note: "Directions for use", value: p.dosage },
    { id: "product-notes", title: "More product information", value: p.seo?.seo_content || p.seo?.extra_content },
  ].filter(section => portfolioText(section.value)) : [], [p]);

  if (isPending) return <div className="corp-container pp-loading" aria-label="Loading product information"><div/><div/></div>;
  if (isError || !p) return <div className="corp-container corp-section"><SEO title="Product unavailable" noindex={error?.response?.status === 404}/><EmptyPortfolio error retry={refetch}/></div>;
  const variant = p.variants.find(value => value.id === variantId) || p.variants[0] || {};
  const images = productImages(p, variantId ? variant : undefined);
  const image = images[imageIndex] || images[0];
  const faqs = (p.seo?.faqs || []).filter(faq => faq?.q && faq.a);
  const publicUrl = siteUrl(`/products/${slug}`);
  const summary = portfolioText(p.short_description);
  const generic = portfolioText(p.generic_name);
  const packLabel = [variant.pack_size, variant.unit].filter(Boolean).join(" · ");
  const navigation = [...sections, ...(faqs.length ? [{ id: "questions", title: "Questions & answers" }] : [])];

  return <>
    <SEO title={p.name} description={summary} seo={p.seo} ogImage={images[0]} canonical={publicUrl}
      jsonLd={[portfolioJsonLd(p, publicUrl, mediaUrl(images[0] || "")), breadcrumbLd([{ name: "Home", path: "/" }, { name: "Our portfolio", path: "/products" }, { name: p.name, path: `/products/${slug}` }]), faqLd(faqs)]}/>
    <article className="pp-page">
      <div className="pp-topbar"><div className="corp-container"><Link to="/products" className="pp-back"><ArrowLeft size={17}/>Our product portfolio</Link><span>VETMECH / {p.category?.name || "ANIMAL HEALTH"}</span></div></div>
      <section className="pp-hero"><div className="corp-container pp-hero-grid">
        <div className="pp-gallery">
          <div className="pp-gallery-heading"><span>PRODUCT GALLERY</span><span>{images.length ? `${imageIndex + 1} / ${images.length}` : "VETMECH"}</span></div>
          {image ? <button className="pp-stage" onClick={() => setZoom(true)} aria-label="View larger product image" data-testid="product-image-enlarge">
            <img src={mediaUrl(image)} alt={`${p.name}${packLabel ? ` — ${packLabel}` : ""}`} fetchPriority="high"/>
            <span className="pp-expand"><Expand size={18}/><span>View larger</span></span>
          </button> : <div className="pp-stage pp-image-empty"><Package size={86} strokeWidth={1}/><p>Product image</p></div>}
          {images.length > 1 && <div className="pp-thumbnails" aria-label="Product images">{images.map((src, index) => <button key={src} aria-label={`View product image ${index + 1}`} aria-pressed={index === imageIndex} onClick={() => setImageIndex(index)}><img src={mediaUrl(src)} alt=""/><span>{String(index + 1).padStart(2, "0")}</span></button>)}</div>}
          <p className="pp-image-caption">{p.brand_name || "VETMECH"}<span>The Science of Animal Health</span></p>
        </div>
        <div className="pp-identity">
          <div className="pp-title">
          <p className="pp-kicker"><span/>{p.category?.name || "VETMECH PRODUCT PORTFOLIO"}</p>
          <h1>{p.name}</h1>
          {generic && <p className="pp-generic">{generic}</p>}
          </div><div className="pp-summary-actions">
          {summary && summary !== generic && <p className="pp-summary">{summary}</p>}
          {navigation.length > 0 && <a className="pp-overview-link" href={`#${navigation[0].id}`}>Explore product information<ChevronDown size={17}/></a>}
          <dl className="pp-facts"><div><dt>BRAND</dt><dd>{p.brand_name || "VETMECH"}</dd></div>{packLabel && <div><dt>{p.variants.length > 1 ? "SELECTED PACK" : "PACK SIZE"}</dt><dd>{packLabel}</dd></div>}</dl>
          {p.variants.length > 1 && <div className="pp-pack-selector"><span>AVAILABLE PACK SIZES</span><div>{p.variants.map(value => <button key={value.id} aria-pressed={value.id === variant.id} onClick={() => { setVariantId(value.id); setImageIndex(0); }}>{[value.pack_size, value.unit].filter(Boolean).join(" · ") || "Standard pack"}</button>)}</div></div>}
          <div className="pp-actions"><ActionLink to={`/contact?product=${encodeURIComponent(p.name)}`}>Product enquiry</ActionLink></div>
          <Link className="pp-shop-link" to={`/shop/products/${p.slug}`}>Order through Partner Shop<ArrowUpRight size={16}/></Link>
          <ShareButtons url={publicUrl} title={p.name} className="pp-share"/>
          </div>
        </div>
      </div></section>

      <div className="corp-container pp-information-grid">
        <aside className="pp-sidebar"><nav className="pp-detail-nav" aria-label="Product information sections"><p>IN THIS PRODUCT</p>{navigation.map((section, index) => <a key={section.id} href={`#${section.id}`}><span>{String(index + 1).padStart(2, "0")}</span>{section.title}<ArrowRight size={14}/></a>)}<div className="pp-sidebar-note"><span>LET'S TALK</span><p>Looking for more product information?</p><Link to={`/contact?product=${encodeURIComponent(p.name)}`}>Contact our team<ArrowUpRight size={16}/></Link></div></nav></aside>
        <div className="pp-information">
          {sections.map((section, index) => <section className={`pp-section pp-section-${section.id}`} id={section.id} key={section.id}>
            <div className="pp-section-heading"><span>{String(index + 1).padStart(2, "0")}</span><div>{section.note && <p>{section.note}</p>}<h2>{section.title}</h2></div></div>
            <ProductContent value={section.value} kind={section.id}/>
          </section>)}
          {faqs.length > 0 && <section id="questions" className="pp-section pp-faq"><div className="pp-section-heading"><span>{String(sections.length + 1).padStart(2, "0")}</span><div><p>Helpful product information</p><h2>Questions & answers</h2></div></div>{faqs.map((faq, index) => <details key={index}><summary>{portfolioText(faq.q)}<span>+</span></summary><ProductContent value={faq.a}/></details>)}</section>}
          <div className="pp-label-note"><Package size={24} strokeWidth={1.4}/><p>Use medicines under the guidance of a registered veterinary practitioner. Refer to the approved product label for complete directions.</p></div>
        </div>
      </div>
    </article>
    <Dialog open={zoom} onOpenChange={setZoom}><DialogContent className="pp-image-dialog"><DialogTitle>{p.name}</DialogTitle><DialogDescription>Product image {imageIndex + 1} of {images.length}</DialogDescription>{image && <img src={mediaUrl(image)} alt={`${p.name} — enlarged product image`}/>}<div className="pp-lightbox-controls">{images.length > 1 && <><button onClick={() => setImageIndex(index => (index - 1 + images.length) % images.length)} aria-label="Previous product image"><ArrowLeft size={20}/></button><span>{imageIndex + 1} / {images.length}</span><button onClick={() => setImageIndex(index => (index + 1) % images.length)} aria-label="Next product image"><ArrowRight size={20}/></button></>}</div></DialogContent></Dialog>
    <Partnership/>
  </>;
}
