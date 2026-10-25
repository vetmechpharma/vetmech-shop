import React, { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, ArrowLeft, ArrowRight, X } from "lucide-react";
import { api } from "@/lib/api";
import { portfolioProduct, speciesCategory } from "@/lib/portfolio.mjs";
import SEO from "@/components/SEO";
import { PageHero, EmptyPortfolio, Partnership } from "@/components/corporate/Shared";
import { SPECIES } from "@/components/corporate/content";
import PortfolioCard from "@/components/corporate/PortfolioCard";

export default function Portfolio() {
  const { slug } = useParams(), [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get("q") || "", categoryParam = slug || params.get("category") || "", species = params.get("species") || "";
  const [search, setSearch] = useState(q), [page, setPage] = useState(1);
  useEffect(() => { setSearch(q); setPage(1); }, [q, categoryParam, species]);
  const categories = useQuery({ queryKey: ["categories"], queryFn: async () => (await api.get("/categories")).data });
  const category = categoryParam || (species ? speciesCategory(species, categories.data || []) : "");
  const missingSpecies = species && categories.isSuccess && !category;
  const products = useQuery({ queryKey: ["corporate-portfolio", q, category, page, missingSpecies], enabled: !species || categories.isSuccess,
    queryFn: async () => { if (missingSpecies) return { items: [], total: 0, pages: 0 }; const { data } = await api.get("/products", { params: { q: q || undefined, category: category || undefined, page, limit: 12 } }); return { ...data, items: (data.items || []).map(portfolioProduct) }; } });
  const name = categoryParam ? categories.data?.find(c => c.slug === categoryParam)?.name : SPECIES.find(s => s.id === species)?.name;
  const update = (key, value) => { const next = new URLSearchParams(params); if(key==="q"&&category)next.set("category",category); next.delete("species"); if (value) next.set(key, value); else next.delete(key); if(slug)navigate(`/products?${next}`);else setParams(next); setPage(1); };
  const submit = e => { e.preventDefault(); update("q", search.trim()); };
  const clear = () => { setSearch(""); if(slug)navigate("/products");else setParams({}); setPage(1); };
  return <><SEO title={name ? `${name} | Product Portfolio` : "Our Product Portfolio"} description="Explore VETMECH veterinary products, compositions, pack sizes and product information."/>
    <PageHero eyebrow="OUR PORTFOLIO" title={name || <>Purpose in every<br/>formulation.</>} description="Discover the VETMECH range. Explore product information, compositions and available pack sizes."/>
    <section className="corp-section corp-portfolio-page"><div className="corp-container"><div className="corp-portfolio-tools"><form onSubmit={submit}><Search size={20}/><input aria-label="Search product portfolio" placeholder="Search by product name or composition" value={search} onChange={e=>setSearch(e.target.value)} data-testid="portfolio-search"/><button type="submit" aria-label="Submit portfolio search"><ArrowRight size={19}/></button></form><label><span>Product category</span><select aria-label="Product category" value={category || ""} onChange={e=>update("category",e.target.value)}><option value="">All categories</option>{(categories.data || []).map(c=><option key={c.id} value={c.slug}>{c.name}</option>)}</select></label></div>
    {(q || category || species) && <div className="corp-active-filter"><span>{q ? `Search: ${q}` : name || categories.data?.find(c=>c.slug===category)?.name || "Selected portfolio"}</span><button onClick={clear}>Clear filters<X size={13}/></button></div>}
    <div className="corp-results-heading"><span>PRODUCT PORTFOLIO</span><p>{products.isPending ? "Loading products…" : `${products.data?.total || 0} ${products.data?.total === 1 ? "product" : "products"}`}</p></div>
    {products.isError || categories.isError ? <EmptyPortfolio error retry={()=>{products.refetch();categories.refetch();}}/> : products.isPending ? <div className="corp-product-grid">{[0,1,2,3].map(i=><div key={i} className="corp-product-skeleton"/>)}</div> : products.data?.items?.length ? <div className="corp-product-grid">{products.data.items.map(product=><PortfolioCard key={product.id} product={product}/>)}</div> : <EmptyPortfolio/>}
    {products.data?.pages > 1 && <nav className="corp-pagination" aria-label="Portfolio pages"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ArrowLeft size={17}/>Previous</button><span>{page} / {products.data.pages}</span><button disabled={page>=products.data.pages} onClick={()=>setPage(p=>p+1)}>Next<ArrowRight size={17}/></button></nav>}
    </div></section><Partnership/></>;
}
