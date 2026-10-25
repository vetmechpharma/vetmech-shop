import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, FlaskConical, FileText, Users } from "lucide-react";
import { api } from "@/lib/api";
import { portfolioText } from "@/lib/portfolio.mjs";
import SEO from "@/components/SEO";
import { PageHero, Eyebrow, Partnership } from "@/components/corporate/Shared";

const TITLES = { research: ["OUR APPROACH", <>Science with<br/>a shared purpose.</>], quality: ["QUALITY PHILOSOPHY", <>Care is in<br/>the details.</>], infrastructure: ["OUR PERSPECTIVE", <>Built around<br/>animal health.</>] };
export default function CorporateScience({ kind="research" }) {
  const { data: page } = useQuery({queryKey:["page",kind],queryFn:async()=>(await api.get(`/pages/${kind}`)).data});
  const body = portfolioText(page?.content), [eyebrow,title] = TITLES[kind] || TITLES.research;
  return <><SEO title={`${eyebrow} | VETMECH`} description="Our perspective on veterinary formulations, product information and professional collaboration."/>
    <PageHero eyebrow={eyebrow} title={title} description="Connecting the science of animal health with the realities of everyday veterinary care."/>
    <section className="corp-section"><div className="corp-container"><div className="corp-science-intro"><Eyebrow>THOUGHTFUL BY NATURE</Eyebrow><h2>Every detail matters.<br/>Every life matters.</h2><p>Our approach is centred on the needs of animals and the professionals who care for them. Useful science begins with clear information, purposeful formulations and an open conversation.</p></div><div className="corp-science-wide"><img src="/corporate/science.webp" alt="Illustrative scientific photograph of a vial and microscope" loading="lazy"/><span>THE SCIENCE OF ANIMAL HEALTH</span></div><div className="corp-value-grid">{[[FlaskConical,"Formulation focus","An animal-health perspective on compositions, dosage forms and practical use."],[FileText,"Product clarity","Accessible information on composition, indications, pack sizes and product directions."],[Users,"Professional dialogue","A connection with veterinary professionals and trade partners to support product enquiries."]].map(([Icon,name,text])=><article key={name}><Icon size={29} strokeWidth={1.3}/><h3>{name}</h3><p>{text}</p></article>)}</div>{body&&!body.startsWith("This is editable sample website content.")&&<div className="corp-cms-copy"><p>{body}</p></div>}<div className="corp-approach-links"><Link to="/quality">Quality philosophy<ArrowUpRight size={20}/></Link><Link to="/products">Our product portfolio<ArrowUpRight size={20}/></Link><Link to="/contact">Speak to our team<ArrowUpRight size={20}/></Link></div></div></section><Partnership/></>;
}
