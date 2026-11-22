import React from "react";
import { companyContacts } from "@/lib/companyContacts";

export default function CompanyLinks({ company, type, icon: Icon }) {
  return companyContacts(company)[type].map(({href, label}) => <a key={href} href={href} style={{display:"flex", alignItems:"center", gap:6, overflowWrap:"anywhere"}}>{Icon && <Icon size={15} aria-hidden="true" />}{label}</a>);
}
