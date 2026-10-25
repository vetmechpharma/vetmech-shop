import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Mail, Phone } from "lucide-react";
import Brand from "./Brand";
import { useSettings } from "@/hooks/useSettings";
import { companyContact } from "./content";

export default function Footer() {
  const { data: company } = useSettings("company");
  const contact = companyContact(company);
  return <footer className="corp-footer"><div className="corp-container">
    <div className="corp-footer-top"><div><Brand light/><p>The Science of Animal Health.</p><p className="corp-footer-purpose">Purposeful science.<br/>A shared commitment to animal care.</p></div>
      <div><h3>Explore VETMECH</h3><Link to="/about">Our company</Link><Link to="/products">Our portfolio</Link><Link to="/research">Our approach</Link><Link to="/quality">Quality philosophy</Link><Link to="/careers">Careers</Link></div>
      <div><h3>Stay connected</h3><Link to="/news">News & resources</Link><Link to="/gallery">Our gallery</Link><Link to="/contact">Contact us</Link><Link to="/shop">Partner Shop <ArrowUpRight size={13}/></Link><Link to="/account">Partner account <ArrowUpRight size={13}/></Link></div>
      <div className="corp-footer-contact"><h3>Start a conversation</h3><a href={`mailto:${contact.email}`}><Mail size={15}/>{contact.email}</a><a href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}><Phone size={15}/>{contact.phone}</a><p>{contact.address}</p>{Object.entries(company?.social || {}).filter(([,url]) => /^https?:\/\//.test(url)).map(([name,url]) => <a href={url} key={name} target="_blank" rel="noreferrer" className="corp-social-link">{name}<ArrowUpRight size={12}/></a>)}</div>
    </div><div className="corp-footer-bottom"><p>© {new Date().getFullYear()} {contact.name}</p><div><Link to="/privacy">Privacy policy</Link><Link to="/terms">Terms of use</Link><span>For veterinary use.</span></div></div>
    <div className="corp-footer-signature" aria-hidden="true">VETMECH<span>.</span></div>
  </div></footer>;
}
