import React from "react";
import { Link } from "react-router-dom";
import { useSettings } from "@/hooks/useSettings";
import { mediaUrl } from "@/lib/api";

export default function Brand({ light = false, to = "/" }) {
  const { data: company } = useSettings("company");
  const uploadedLogo = !light && company?.logo && !company.logo.startsWith("/demo/");
  if(uploadedLogo) return <Link to={to} aria-label="VETMECH home" className="corp-brand corp-uploaded-brand"><img src={mediaUrl(company.logo)} alt="VETMECH"/></Link>;
  return <Link to={to} aria-label="VETMECH home" className={`corp-brand ${light ? "corp-brand-light" : ""}`}>
    <svg viewBox="0 0 40 43" aria-hidden="true"><path d="M3 4h9l12 25-5 10L3 4Z" fill="currentColor"/><path d="m24 4 6 13-5 10-6-13 5-10Zm10 0h7L28 32l-4-8L34 4Z" fill="#e21c2a"/></svg>
    <span><strong>VETMECH<span className="corp-brand-stop">.</span></strong><small>PHARMACEUTICALS</small></span>
  </Link>;
}
