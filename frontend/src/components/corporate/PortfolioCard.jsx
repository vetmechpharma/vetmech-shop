import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Package } from "lucide-react";
import { mediaUrl } from "@/lib/api";
import { portfolioProduct, portfolioText } from "@/lib/portfolio.mjs";

export default function PortfolioCard({ product }) {
  const p = portfolioProduct(product);
  const packs = [...new Set(p.variants.map(v => v.pack_size).filter(Boolean))];
  return <Link to={`/products/${p.slug}`} className="corp-product-card" data-testid={`portfolio-card-${p.slug}`}>
    <div className="corp-product-image">{p.image ? <img src={mediaUrl(p.image)} alt={p.name} loading="lazy" decoding="async"/> : <Package size={64} strokeWidth={1}/>}<span className="corp-product-arrow"><ArrowUpRight size={21}/></span></div>
    <div className="corp-product-copy"><p className="corp-product-type">{p.category?.name || p.brand_name || "VETERINARY CARE"}</p><h3>{p.name}</h3><p className="corp-product-description">{portfolioText(p.generic_name || p.short_description || p.composition)}</p>{packs.length > 0 && <p className="corp-product-pack">{packs.join(" · ")}</p>}<span className="corp-product-detail-link">Discover product <ArrowUpRight size={15}/></span></div>
  </Link>;
}
