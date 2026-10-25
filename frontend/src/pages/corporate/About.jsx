import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import SEO from "@/components/SEO";
import { portfolioText } from "@/lib/portfolio.mjs";
import { PageHero, Eyebrow, ActionLink, Partnership } from "@/components/corporate/Shared";

export default function CorporateAbout() {
  const { data: page } = useQuery({ queryKey:["page","about"],queryFn:async()=>(await api.get("/pages/about")).data });
  const body = portfolioText(page?.content);
  return <><SEO title="Our Company | VETMECH Pharmaceuticals" description="Discover the purpose and people behind VETMECH Pharmaceuticals Private Limited."/>
    <PageHero eyebrow="OUR COMPANY" title={<>A commitment<br/>that connects us.</>} description="VETMECH PHARMACEUTICALS PRIVATE LIMITED. The Science of Animal Health."/>
    <section className="corp-section"><div className="corp-container corp-about-grid"><div className="corp-about-photo"><img src="/corporate/animal-care.webp" alt="A dairy cow receiving gentle veterinary care"/><span>ANIMAL HEALTH. HUMAN COMMITMENT.</span></div><div><Eyebrow>THIS IS VETMECH</Eyebrow><h2>Inspired by science.<br/>Grounded in care.</h2><p className="corp-lead">Animal health is connected to the lives of veterinary professionals, farming families and the communities around them.</p><p>VETMECH brings a portfolio of veterinary pharmaceuticals and product information to the people caring for animals. Our purpose is to support informed veterinary care through considered formulations, clear communication and professional partnerships.</p><p>From cattle and buffalo to poultry, small ruminants and companion animals, our perspective begins with the needs of the animal and the professional caring for it.</p><ActionLink to="/products">Explore our portfolio</ActionLink></div></div></section>
    <section className="corp-section corp-values-section"><div className="corp-container"><div className="corp-section-heading"><div><Eyebrow>WHAT GUIDES US</Eyebrow><h2>Our purpose.<br/>Our perspective.</h2></div></div><div className="corp-value-grid">{[["01","Animal care comes first","We place animal health at the centre of our products, communication and relationships."],["02","Science brings clarity","We value clear compositions, useful product information and a considered approach to formulation."],["03","Partnership makes progress","We work with the veterinary and trade communities who bring care to animals every day."]].map(([n,title,text])=><article key={n}><span>{n}</span><h3>{title}</h3><p>{text}</p></article>)}</div>{body&&!body.startsWith("This is editable sample website content.")&&<div className="corp-cms-copy"><h3>More about VETMECH</h3><p>{body}</p></div>}</div></section><Partnership/></>;
}
