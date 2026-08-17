import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import SEO from "@/components/SEO";
import ProductCard from "@/components/public/ProductCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, SlidersHorizontal } from "lucide-react";

export default function Products() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [brand, setBrand] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => { setQ(params.get("q") || ""); }, [params]);

  const { data: brands } = useQuery({ queryKey: ["brands"], queryFn: async () => (await api.get("/brands")).data });
  const { data, isLoading } = useQuery({
    queryKey: ["products", q, brand, availability, page],
    queryFn: async () => (await api.get("/products", {
      params: {
        q: q || undefined,
        brand: brand !== "all" ? brand : undefined,
        availability: availability !== "all" ? availability : undefined,
        page, limit: 12,
      },
    })).data,
  });

  const submit = (e) => { e.preventDefault(); setPage(1); setParams(q ? { q } : {}); };

  return (
    <div className="vm-container py-10">
      <SEO title="All Products" description="Browse the complete VETMECH veterinary product catalog." />
      <h1 className="font-heading text-3xl md:text-4xl font-bold text-vm-ink tracking-tight">All Products</h1>
      <p className="text-slate-500 mt-1">Search and filter our complete veterinary range</p>

      <div className="mt-6 flex flex-col md:flex-row gap-3">
        <form onSubmit={submit} className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products, composition, SKU..."
                 className="pl-9" data-testid="products-search-input" />
        </form>
        <div className="flex gap-3">
          <Select value={brand} onValueChange={(v) => { setBrand(v); setPage(1); }}>
            <SelectTrigger className="w-40" data-testid="filter-brand"><SelectValue placeholder="Brand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {(brands || []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={availability} onValueChange={(v) => { setAvailability(v); setPage(1); }}>
            <SelectTrigger className="w-40" data-testid="filter-availability"><SelectValue placeholder="Availability" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="in_stock">In Stock</SelectItem>
              <SelectItem value="out_of_stock">Out of Stock</SelectItem>
              <SelectItem value="coming_soon">Coming Soon</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-8">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-80 rounded-lg" />)}
          </div>
        ) : data?.items?.length ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {data.items.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
            {data.pages > 1 && (
              <div className="flex justify-center gap-2 mt-10">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="px-4 py-2 text-sm text-slate-500">Page {page} of {data.pages}</span>
                <Button variant="outline" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20 text-slate-400">
            <SlidersHorizontal className="w-10 h-10 mx-auto mb-3 opacity-40" />
            No products match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
