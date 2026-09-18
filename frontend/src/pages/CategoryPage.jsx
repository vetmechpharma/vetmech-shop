import React from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import SEO from "@/components/SEO";
import ProductCard from "@/components/public/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { breadcrumbLd, siteUrl } from "@/lib/seo";

export default function CategoryPage() {
  const { slug } = useParams();
  const { data: cat } = useQuery({ queryKey: ["category", slug], queryFn: async () => (await api.get(`/categories/${slug}`)).data });
  const { data, isLoading } = useQuery({
    queryKey: ["cat-products", slug],
    queryFn: async () => (await api.get("/products", { params: { category: slug, limit: 24 } })).data,
  });

  const crumbs = [{ name: "Home", path: "/" }, { name: "Products", path: "/products" }];
  if (cat?.parent?.slug) crumbs.push({ name: cat.parent.name, path: `/categories/${cat.parent.slug}` });
  if (cat?.name) crumbs.push({ name: cat.name, path: `/categories/${slug}` });
  const collectionLd = cat ? {
    "@context": "https://schema.org", "@type": "CollectionPage",
    name: cat.seo?.title || cat.name, description: cat.seo?.meta_description || cat.description,
    url: siteUrl(`/categories/${slug}`),
  } : null;
  const itemListLd = (data?.items?.length) ? {
    "@context": "https://schema.org", "@type": "ItemList",
    itemListElement: data.items.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.name, url: siteUrl(`/products/${p.slug}`) })),
  } : null;
  const jsonLd = [breadcrumbLd(crumbs), collectionLd, itemListLd].filter(Boolean);

  return (
    <div>
      <SEO title={cat?.name} description={cat?.description} seo={cat?.seo} jsonLd={jsonLd} canonical={siteUrl(`/categories/${slug}`)} />
      <section className="bg-vm-ink text-white">
        <div className="vm-container py-14">
          <nav className="text-xs uppercase tracking-widest text-vm-accent" aria-label="Breadcrumb">
            <Link to="/products" className="hover:underline">Products</Link>
            {cat?.parent?.slug && <> / <Link to={`/categories/${cat.parent.slug}`} className="hover:underline">{cat.parent.name}</Link></>}
            {" "}/ {cat?.name}
          </nav>
          <h1 className="font-heading text-4xl font-bold mt-2 tracking-tight">{cat?.name || "Category"}</h1>
          <p className="text-slate-300 mt-2 max-w-2xl">{cat?.seo?.intro || cat?.description}</p>
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
