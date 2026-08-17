import React from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import SEO from "@/components/SEO";
import ProductCard from "@/components/public/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";

export default function CategoryPage() {
  const { slug } = useParams();
  const { data: cat } = useQuery({ queryKey: ["category", slug], queryFn: async () => (await api.get(`/categories/${slug}`)).data });
  const { data, isLoading } = useQuery({
    queryKey: ["cat-products", slug],
    queryFn: async () => (await api.get("/products", { params: { category: slug, limit: 24 } })).data,
  });

  return (
    <div>
      <SEO title={cat?.name} description={cat?.description} seo={cat?.seo} />
      <section className="bg-vm-ink text-white">
        <div className="vm-container py-14">
          <p className="text-xs uppercase tracking-widest text-vm-accent"><Link to="/products">Products</Link> / {cat?.name}</p>
          <h1 className="font-heading text-4xl font-bold mt-2 tracking-tight">{cat?.name || "Category"}</h1>
          <p className="text-slate-300 mt-2 max-w-2xl">{cat?.description}</p>
        </div>
      </section>
      <div className="vm-container py-10">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-80 rounded-lg" />)}
          </div>
        ) : data?.items?.length ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {data.items.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        ) : <p className="text-center py-20 text-slate-400">No products in this category yet.</p>}
      </div>
    </div>
  );
}
