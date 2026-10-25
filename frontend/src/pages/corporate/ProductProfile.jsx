import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Package, FileDown } from "lucide-react";
import { api, mediaUrl } from "@/lib/api";
import { portfolioProduct, portfolioJsonLd, portfolioText } from "@/lib/portfolio.mjs";
import SEO from "@/components/SEO";
import { siteUrl, breadcrumbLd, faqLd } from "@/lib/seo";
import { Eyebrow, ActionLink, Partnership, EmptyPortfolio } from "@/components/corporate/Shared";

export default function ProductProfile() {
  const { slug } = useParams();
  const [variantId, setVariantId] = useState(""), [imageIndex, setImageIndex] = useState(0);
  useEffect(()=>{setVariantId("");setImageIndex(0);},[slug]);
  const { data: p, isPending, isError, refetch } = useQuery({ queryKey: ["corporate-product", slug], queryFn: async()=>portfolioProduct((await api.get(`/products/${slug}`)).data) });
  if(isPending) return <div className="corp-container corp-section"><div className="corp-product-skeleton" style={{height:500}}/></div>;
  if(isError || !p) return <div className="corp-container corp-section"><EmptyPortfolio error retry={refetch}/></div>;
  const variant = p.variants.find(v=>v.id===variantId) || p.variants[0] || {};
  const images = (variant.images?.length ? variant.images : p.images?.length ? p.images : [p.image]).filter(Boolean);
  const sections = [["Composition",p.composition],["Product overview",p.full_description],["Indications",p.indications],["Dosage & administration",p.dosage],["Benefits",p.benefits],["Precautions",p.precautions],["Storage",p.storage],["Additional information",p.additional_info]].filter(([,v])=>portfolioText(v));
  return <><SEO title={p.name} description={portfolioText(p.short_description)} seo={p.seo} ogImage={images[0]} canonical={siteUrl(`/products/${slug}`)} jsonLd={[portfolioJsonLd(p,siteUrl(`/products/${slug}`),mediaUrl(images[0]||"")),breadcrumbLd([{name:"Home",path:"/"},{name:"Our portfolio",path:"/products"},{name:p.name,path:`/products/${slug}`}]),faqLd(p.seo?.faqs)]}/>
    <section className="corp-product-profile"><div className="corp-container"><Link className="corp-back-link" to="/products"><ArrowLeft size={16}/>Back to our portfolio</Link><div className="corp-profile-grid"><div><div className="corp-profile-image">{images[imageIndex] ? <img src={mediaUrl(images[imageIndex])} alt={p.name}/> : <Package size={100} strokeWidth={1}/>}</div>{images.length>1&&<div className="corp-image-thumbs">{images.map((src,i)=><button key={src+i} aria-label={`Product image ${i+1}`} aria-pressed={i===imageIndex} onClick={()=>setImageIndex(i)}><img src={mediaUrl(src)} alt=""/></button>)}</div>}</div>
      <div className="corp-profile-copy"><Eyebrow>{p.category?.name || "VETMECH PRODUCT PORTFOLIO"}</Eyebrow><h1>{p.name}</h1><p className="corp-profile-generic">{portfolioText(p.generic_name || p.short_description)}</p>{p.composition&&<div className="corp-composition-highlight"><span>COMPOSITION</span><p>{portfolioText(p.composition)}</p></div>}
      {p.variants.length>0&&<div className="corp-profile-packs"><span>AVAILABLE PACK SIZES</span><div>{p.variants.map(v=><button key={v.id} aria-pressed={v.id===variant.id} onClick={()=>{setVariantId(v.id);setImageIndex(0);}}>{v.pack_size || v.unit || "Standard pack"}</button>)}</div></div>}
      <div className="corp-profile-actions"><ActionLink to={`/contact?product=${encodeURIComponent(p.name)}`}>Enquire about this product</ActionLink>{(p.brochure_url||p.pdf_url)&&<a className="corp-text-link" href={mediaUrl(p.brochure_url||p.pdf_url)} target="_blank" rel="noreferrer"><FileDown size={17}/>Product literature</a>}</div><Link className="corp-profile-shop" to={`/shop/products/${p.slug}`}>For orders, visit Partner Shop <ArrowUpRight size={15}/></Link></div>
    </div><div className="corp-product-information"><div><Eyebrow>PRODUCT INFORMATION</Eyebrow><h2>A closer look.</h2><p>Use medicines under the guidance of a registered veterinary practitioner. Refer to the approved product label for complete directions.</p></div><div>{sections.map(([title,body])=><details key={title} open={title==="Composition" || title==="Product overview"}><summary>{title}<span>+</span></summary><p>{portfolioText(body)}</p></details>)}{p.seo?.faqs?.map((faq,i)=><details key={i}><summary>{faq.q}<span>+</span></summary><p>{faq.a}</p></details>)}</div></div></div></section><Partnership/></>;
}
