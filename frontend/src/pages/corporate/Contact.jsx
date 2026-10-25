import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUpRight, MapPin, Mail, Phone, CheckCircle2 } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useSettings } from "@/hooks/useSettings";
import { companyContact } from "@/components/corporate/content";
import SEO from "@/components/SEO";
import { PageHero, Eyebrow } from "@/components/corporate/Shared";

export default function CorporateContact() {
  const [params] = useSearchParams();
  const product = params.get("product") || "";
  const { data: company } = useSettings("company"), contact=companyContact(company);
  const [form,setForm] = useState({name:"",mobile:"",email:"",subject:product?`Product enquiry: ${product}`:"General enquiry",message:""});
  const [sending,setSending]=useState(false),[status,setStatus]=useState(null);
  useEffect(()=>{if(product)setForm(f=>({...f,subject:`Product enquiry: ${product}`}));},[product]);
  const field = (name,value)=>setForm(f=>({...f,[name]:value}));
  const submit=async e=>{e.preventDefault();if(sending)return;setSending(true);setStatus(null);try{await api.post("/enquiries",form);setStatus({ok:true,text:"Thank you. Your enquiry has been received. Our team will get in touch."});setForm(f=>({...f,name:"",mobile:"",email:"",message:""}));}catch(error){setStatus({ok:false,text:apiError(error)});}finally{setSending(false);}};
  return <><SEO title="Contact VETMECH" description="Contact VETMECH Pharmaceuticals for product information, veterinary portfolio enquiries and professional partnerships."/>
    <PageHero eyebrow="GET IN TOUCH" title={<>Good conversations.<br/>Better possibilities.</>} description="For product information, partnerships or a conversation about animal health, we're here to help."/>
    <section className="corp-section"><div className="corp-container corp-contact-grid"><div><Eyebrow>LET'S CONNECT</Eyebrow><h2>Start a conversation<br/>with VETMECH.</h2><p className="corp-contact-intro">Tell us what you have in mind. We'll connect your enquiry with the right person.</p><div className="corp-contact-details"><div><MapPin size={22}/><section><span>OUR ADDRESS</span><p>{contact.address}</p></section></div><div><Mail size={22}/><section><span>EMAIL US</span><a href={`mailto:${contact.email}`}>{contact.email}<ArrowUpRight size={16}/></a></section></div><div><Phone size={22}/><section><span>CALL US</span><a href={`tel:${contact.phone.replace(/[^+\d]/g,"")}`}>{contact.phone}<ArrowUpRight size={16}/></a></section></div></div></div>
    <form className="corp-contact-form" onSubmit={submit} data-testid="contact-form"><h3>Send us an enquiry</h3><div className="corp-form-row"><label>Your name<span>*</span><input required autoComplete="name" value={form.name} onChange={e=>field("name",e.target.value)} data-testid="contact-name" placeholder="Full name"/></label><label>Phone number<span>*</span><input required type="tel" autoComplete="tel" value={form.mobile} onChange={e=>field("mobile",e.target.value)} data-testid="contact-mobile" placeholder="Mobile number"/></label></div><label>Email address<input type="email" autoComplete="email" value={form.email} onChange={e=>field("email",e.target.value)} placeholder="you@company.com"/></label><label>Subject<input required value={form.subject} onChange={e=>field("subject",e.target.value)}/></label><label>Your message<span>*</span><textarea required rows={5} value={form.message} onChange={e=>field("message",e.target.value)} data-testid="contact-message" placeholder="How can we help?"/></label><p className="corp-form-note">Your details will be used to respond to this enquiry.</p>{status&&<p className={`corp-form-status ${status.ok?"is-success":"is-error"}`} role="status">{status.ok&&<CheckCircle2 size={19}/>}<span>{status.text}</span></p>}<button type="submit" className="corp-button" disabled={sending} data-testid="contact-submit"><span>{sending?"Sending enquiry…":"Send enquiry"}</span><ArrowUpRight size={18}/></button></form></div></section>
  </>;
}
