import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ArrowRight, Check } from "lucide-react";
import { api, mediaUrl } from "@/lib/api";
import { useSettings } from "@/hooks/useSettings";
import SEO from "@/components/SEO";
import { organizationLd, websiteLd } from "@/lib/seo";
import { portfolioProduct } from "@/lib/portfolio.mjs";
import { corporateContent, SPECIES } from "@/components/corporate/content";
import { Eyebrow, ActionLink, TextLink, SpeciesIcon, Partnership, ScrollHint, EmptyPortfolio } from "@/components/corporate/Shared";
import PortfolioCard from "@/components/corporate/PortfolioCard";

export default function CorporateHome() {
  const { data: homepage } = useSettings("homepage"), { data: company } = useSettings("company");
  const content = corporateContent(homepage);
  const featuredIds = homepage?.featured_product_ids || [];
  const { data: products, isPending, isError, refetch } = useQuery({ queryKey: ["corporate-featured",featuredIds.join(",")], queryFn: async () => {
    if(featuredIds.length) { const selected=(await api.get("/products/by-ids",{params:{ids:featuredIds.join(",")}})).data; if(selected?.length)return selected.slice(0,4).map(portfolioProduct); }
    const { data } = await api.get("/products", { params: { limit: 4 } });
    return (data.items || []).map(portfolioProduct);
  }});
  return <>
    <SEO title="VETMECH | The Science of Animal Health" description="Discover VETMECH Pharmaceuticals, our veterinary product portfolio and our commitment to animal health." ogImage={content.hero.image} jsonLd={[organizationLd(company), websiteLd()]}/>
    <section className="corp-hero" data-testid="corporate-hero"><img className="corp-hero-photo" src={mediaUrl(content.hero.image)} alt="Veterinary care for a dairy cow" fetchPriority="high"/><div className="corp-hero-shade"/>
      <div className="corp-container corp-hero-inner"><div className="corp-hero-content"><Eyebrow light>{content.hero.eyebrow}</Eyebrow><h1>{content.hero.title}</h1><p>{content.hero.text}</p><div className="corp-hero-buttons"><ActionLink to="/products">Explore our portfolio</ActionLink><Link to="/about" className="corp-hero-secondary">Discover VETMECH <ArrowRight size={18}/></Link></div><ScrollHint/></div>
      <div className="corp-hero-caption"><span className="corp-red-cross" aria-hidden="true">+</span><div>SCIENCE WITH PURPOSE.<br/><strong>Care without compromise.</strong></div></div></div>
    </section>
    <div className="corp-species-strip"><div className="corp-container">{SPECIES.map(species => <Link to={`/products?species=${species.id}`} key={species.id}><SpeciesIcon species={species.id}/><div><span>{species.short}</span><strong>{species.name}</strong></div><ArrowUpRight size={17}/></Link>)}</div></div>
    <section id="our-purpose" className="corp-section corp-purpose"><div className="corp-container corp-purpose-grid"><div><Eyebrow>{content.intro.eyebrow}</Eyebrow><h2>{content.intro.title}</h2></div><div className="corp-purpose-copy"><p>{content.intro.text}</p><TextLink to="/about">Meet VETMECH</TextLink><div className="corp-purpose-note"><span>OUR COMMITMENT</span><strong>To the animals.<br/>To the people who care for them.</strong></div></div></div></section>
    <section className="corp-section corp-segments"><div className="corp-container"><div className="corp-section-heading"><div><Eyebrow>OUR WORLD OF ANIMAL CARE</Eyebrow><h2>Different lives.<br/>One commitment.</h2></div><p>Explore our portfolio across the animal segments we care about.</p></div><div className="corp-segment-grid">{SPECIES.map((species,i) => <Link to={`/products?species=${species.id}`} className="corp-segment-card" key={species.id}><div className="corp-segment-top"><SpeciesIcon species={species.id}/><span>0{i+1}</span></div><h3>{species.name}</h3><p>{species.description}</p><span className="corp-segment-action">Explore the portfolio <ArrowUpRight size={18}/></span></Link>)}</div></div></section>
    <section className="corp-science-feature"><div className="corp-science-image"><img src={mediaUrl(content.science.image)} alt="Illustrative life-science photography of a vial and microscope" loading="lazy"/></div><div className="corp-science-copy"><Eyebrow light>OUR APPROACH</Eyebrow><h2>{content.science.title}</h2><p>{content.science.text}</p><ul>{["Purposeful formulations", "Clear product information", "Professional partnerships"].map(text => <li key={text}><Check size={17}/>{text}</li>)}</ul><ActionLink to="/research" outline light>Explore our approach</ActionLink></div></section>
    <section className="corp-section corp-portfolio-feature"><div className="corp-container"><div className="corp-section-heading"><div><Eyebrow>THE VETMECH PORTFOLIO</Eyebrow><h2>Discover our<br/>product range.</h2></div><TextLink to="/products">View the complete portfolio</TextLink></div>{isPending ? <div className="corp-product-grid">{[0,1,2,3].map(i=><div key={i} className="corp-product-skeleton"/>)}</div> : isError ? <EmptyPortfolio error retry={refetch}/> : <div className="corp-product-grid">{products?.map(product => <PortfolioCard key={product.id} product={product}/>)}</div>}</div></section>
    <section className="corp-partner-note"><div className="corp-container"><div><Eyebrow>ALREADY A VETMECH PARTNER?</Eyebrow><h2>Your business. Connected.</h2><p>Access your partner account and order through our dedicated ordering workspace.</p></div><ActionLink to="/shop" outline>Go to Partner Shop</ActionLink></div></section>
    <Partnership/>
  </>;
}
