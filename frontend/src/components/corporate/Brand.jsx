import React from "react";
import { Link } from "react-router-dom";

export default function Brand({ light = false, to = "/", ...props }) {
  return <Link to={to} aria-label={to === "/admin" ? "VETMECH admin dashboard" : "VETMECH home"} className={`corp-brand ${light ? "corp-brand-light" : ""}`} {...props}>
    <img className="corp-brand-mark" src="/corporate/vetmech-mark.jpg" width="44" height="44" alt="" />
    <span><strong>VETMECH</strong><small>PHARMACEUTICALS</small></span>
  </Link>;
}
