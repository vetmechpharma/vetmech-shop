import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import SEO from "@/components/SEO";
import ProductCard from "@/components/public/ProductCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Search, SlidersHorizontal, X } from "lucide-react";

const AVAIL = [{ v: "in_stock", l: "In Stock" }, { v: "out_of_stock", l: "Out of Stock" }, { v: "coming_soon", l: "Coming Soon" }];

function FilterRail({ categories, brands, category, setCategory, brand, setBrand, availability, setAvailability, reset }) {
  const Row = ({ active, onClick, children, testid }) => (
    <button onClick={onClick} data-testid={testid}
      className={`block w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors ${active ? "bg-vm-green/10 text-vm-green font-semibold" : "text-slate-600 hover:bg-slate-100"}`}>{children}</button>
  );
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-heading font-bold text-vm-ink">Filters</h3>
        <button onClick={reset} className="text-xs text-vm-accent hover:underline flex items-center gap-1" data-testid="filter-reset"><X className="w-3 h-3" /> Clear</button>
      </div>
      <Accordion type="multiple" defaultValue={["cat", "brand", "avail"]} className="w-full">
        <AccordionItem value="cat"><AccordionTrigger className="text-sm font-semibold">Category</AccordionTrigger>
          <AccordionContent><div className="max-h-64 overflow-y-auto pr-1">
            <Row active={category === "all"} onClick={() => setCategory("all")} testid="fcat-all">All Categories</Row>
            {(categories || []).map((c) => <Row key={c.id} active={category === c.slug} onClick={() => setCategory(c.slug)} testid={`fcat-${c.slug}`}>{c.name}</Row>)}
          </div></AccordionContent>
        </AccordionItem>
        <AccordionItem value="brand"><AccordionTrigger className="text-sm font-semibold">Brand</AccordionTrigger>
          <AccordionContent><div className="max-h-64 overflow-y-auto pr-1">
            <Row active={brand === "all"} onClick={() => setBrand("all")} testid="fbrand-all">All Brands</Row>
            {(brands || []).map((b) => <Row key={b.id} active={brand === b.id} onClick={() => setBrand(b.id)} testid={`fbrand-${b.id}`}>{b.name}</Row>)}
          </div></AccordionContent>
        </AccordionItem>
        <AccordionItem value="avail"><AccordionTrigger className="text-sm font-semibold">Availability</AccordionTrigger>
          <AccordionContent>
            <Row active={availability === "all"} onClick={() => setAvailability("all")} testid="favail-all">All</Row>
            {AVAIL.map((a) => <Row key={a.v} active={availability === a.v} onClick={() => setAvailability(a.v)} testid={`favail-${a.v}`}>{a.l}</Row>)}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

export default function Products() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [category, setCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => { setQ(params.get("q") || ""); }, [params]);

  const { data: brands } = useQuery({ queryKey: ["brands"], queryFn: async () => (await api.get("/brands")).data });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: async () => (await api.get("/categories")).data });
  const { data, isLoading } = useQuery({
    queryKey: ["products", q, category, brand, availability, page],
    queryFn: async () => (await api.get("/products", {
      params: {
        q: q || undefined, category: category !== "all" ? category : undefined,
        brand: brand !== "all" ? brand : undefined,
        availability: availability !== "all" ? availability : undefined, page, limit: 12,
      },
    })).data,
  });

  const submit = (e) => { e.preventDefault(); setPage(1); setParams(q ? { q } : {}); };
  const railProps = {
    categories, brands, category, brand, availability,
    setCategory: (v) => { setCategory(v); setPage(1); }, setBrand: (v) => { setBrand(v); setPage(1); },
    setAvailability: (v) => { setAvailability(v); setPage(1); },
    reset: () => { setCategory("all"); setBrand("all"); setAvailability("all"); setPage(1); },
  };

  return (
    <div className="vm-container py-10">
      <SEO title="All Products" description="Browse the complete VETMECH veterinary product catalog." />
      <h1 className="font-heading text-3xl md:text-4xl font-bold text-vm-ink tracking-tight">All Products</h1>
      <p className="text-slate-500 mt-1">Search and filter our complete veterinary range</p>

      <div className="mt-6 flex gap-8">
        <aside className="hidden lg:block w-64 shrink-0"><div className="sticky top-24 bg-white border border-vm-border rounded-xl p-4"><FilterRail {...railProps} /></div></aside>

        <div className="flex-1 min-w-0">
          <div className="flex gap-3 mb-6">
            <form onSubmit={submit} className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products, composition, SKU..." className="pl-9" data-testid="products-search-input" />
            </form>
            <Sheet>
              <SheetTrigger asChild><Button variant="outline" className="lg:hidden" data-testid="mobile-filter-btn"><SlidersHorizontal className="w-4 h-4 mr-2" /> Filters</Button></SheetTrigger>
              <SheetContent side="left" className="w-80 overflow-y-auto"><div className="mt-6"><FilterRail {...railProps} /></div></SheetContent>
            </Sheet>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-80 rounded-lg" />)}</div>
          ) : data?.items?.length ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">{data.items.map((p) => <ProductCard key={p.id} product={p} />)}</div>
              {data.pages > 1 && (
                <div className="flex justify-center gap-2 mt-10">
                  <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <span className="px-4 py-2 text-sm text-slate-500">Page {page} of {data.pages}</span>
                  <Button variant="outline" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-20 text-slate-400"><SlidersHorizontal className="w-10 h-10 mx-auto mb-3 opacity-40" />No products match your filters.</div>
          )}
        </div>
      </div>
    </div>
  );
}
