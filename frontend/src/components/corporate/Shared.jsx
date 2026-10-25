import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowRight, MoveDown } from "lucide-react";

export function Eyebrow({ children, light = false }) { return <p className={`corp-eyebrow ${light ? "is-light" : ""}`}><span />{children}</p>; }
export function ActionLink({ to, children, outline = false, light = false, ...props }) {
  return <Link to={to} className={`corp-button ${outline ? "is-outline" : ""} ${light ? "is-white" : ""}`} {...props}><span>{children}</span><ArrowUpRight size={18} /></Link>;
}
export function TextLink({ to, children, ...props }) { return <Link to={to} className="corp-text-link" {...props}>{children}<ArrowUpRight size={18} /></Link>; }
export function PageHero({ eyebrow, title, description, children }) {
  return <section className="corp-page-hero"><div className="corp-container"><nav className="corp-breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><ArrowRight size={12}/><span>{eyebrow}</span></nav><Eyebrow light>{eyebrow}</Eyebrow><h1>{title}</h1>{description && <p className="corp-page-description">{description}</p>}{children}</div><span className="corp-page-mark" aria-hidden="true">V</span></section>;
}
export function Partnership() {
  return <section className="corp-partnership"><div className="corp-container corp-partnership-inner"><div><Eyebrow light>LET'S MOVE FORWARD, TOGETHER</Eyebrow><h2>Progress starts with<br/>a conversation.</h2></div><ActionLink to="/contact" light>Get in touch</ActionLink></div></section>;
}
export function SpeciesIcon({ species, ...props }) {
  const drawings = {
    cattle: <><path d="m13 12-5-5-2 8 6 4m23-7 5-5 2 8-6 4M15 9l3 5m12-5-3 5M14 16l-2 15c0 7 24 7 24 0l-2-15c-4-5-16-5-20 0Z"/><path d="M14 29c4-4 16-4 20 0M19 32h.1M29 32h.1M17 21h.1M31 21h.1"/></>,
    sheep: <><path d="M16 13c-7-8-13 3-6 7m22-7c7-8 13 3 6 7M17 13c3-5 11-5 14 0l3 13c0 9-20 9-20 0l3-13ZM19 21h.1M29 21h.1M21 29l3 3 3-3M16 16l-7 5m23-5 7 5"/></>,
    poultry: <><path d="M22 14c-6-10 5-13 5-5 7-6 11 3 4 5M17 19c-8 1-9 11-2 15 8 5 21 1 21-8V17c0-7-14-9-16-1M36 19l7 3-7 3M12 25l-6-8m9 17-2 7m15-5 1 5m-10-18c7-3 12 6 4 9M31 17h.1"/></>,
    companion: <><path d="m15 16-5-8c-8 1-8 18 1 16m22-8 5-8c8 1 8 18-1 16M15 14c4-4 14-4 18 0l3 17c-4 10-20 10-24 0l3-17ZM18 23h.1M30 23h.1m-9 5 3 3 3-3m-3 3v5"/></>,
  };
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{drawings[species] || drawings.cattle}</svg>;
}
export function EmptyPortfolio({ error = false, retry }) {
  return <div className="corp-empty" role="status"><h3>{error ? "Our portfolio is temporarily unavailable." : "No products found in this selection."}</h3><p>{error ? "Please try again or contact our team for product information." : "Try another search or explore the complete portfolio."}</p>{retry ? <button onClick={retry} className="corp-text-link">Try again <ArrowRight size={16}/></button> : <TextLink to="/products">Explore all products</TextLink>}</div>;
}
export function ScrollHint() { return <a href="#our-purpose" className="corp-scroll-hint"><MoveDown size={15}/> SCROLL TO EXPLORE</a>; }
