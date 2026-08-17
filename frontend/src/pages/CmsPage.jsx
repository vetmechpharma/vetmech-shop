import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api, mediaUrl } from "@/lib/api";
import SEO from "@/components/SEO";
import { Skeleton } from "@/components/ui/skeleton";

export default function CmsPage({ slug }) {
  const { data: page, isLoading } = useQuery({ queryKey: ["page", slug], queryFn: async () => (await api.get(`/pages/${slug}`)).data });

  if (isLoading) return <div className="vm-container py-16 space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64" /></div>;
  if (!page) return <div className="vm-container py-20 text-center text-slate-400">Page not found.</div>;

  return (
    <div>
      <SEO title={page.title} description={page.subtitle} seo={page.seo} />
      <section className="relative bg-vm-ink text-white">
        {page.banner && <img src={mediaUrl(page.banner)} alt={page.title} className="absolute inset-0 w-full h-full object-cover" />}
        <div className="absolute inset-0 hero-overlay" />
        <div className="vm-container relative py-16 md:py-24">
          <h1 className="font-heading text-4xl md:text-5xl font-extrabold tracking-tight">{page.title}</h1>
          {page.subtitle && <p className="mt-3 text-slate-200 text-lg max-w-2xl">{page.subtitle}</p>}
        </div>
      </section>
      <div className="vm-container py-12 max-w-4xl">
        <div className="prose-vm text-slate-600 leading-relaxed whitespace-pre-line">{page.content}</div>
      </div>
    </div>
  );
}
