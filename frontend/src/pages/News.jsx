import React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, mediaUrl } from "@/lib/api";
import SEO from "@/components/SEO";
import { Skeleton } from "@/components/ui/skeleton";

export function NewsList() {
  const { data, isLoading } = useQuery({ queryKey: ["news-list"], queryFn: async () => (await api.get("/news", { params: { limit: 24 } })).data });
  return (
    <div>
      <SEO title="News & Articles" description="Latest news and veterinary care articles from VETMECH." />
      <section className="bg-vm-ink text-white"><div className="vm-container py-14"><h1 className="font-heading text-4xl font-bold tracking-tight">News & Articles</h1><p className="text-slate-300 mt-2">Insights, updates and veterinary care tips</p></div></section>
      <div className="vm-container py-10">
        {isLoading ? <div className="grid md:grid-cols-3 gap-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-lg" />)}</div> :
          <div className="grid md:grid-cols-3 gap-6">
            {(data?.items || []).map((n) => (
              <Link key={n.id} to={`/news/${n.slug}`} className="group border border-[#E2E8F0] rounded-lg overflow-hidden hover:border-vm-accent transition-colors" data-testid={`news-${n.slug}`}>
                {n.featured_image && <img src={mediaUrl(n.featured_image)} alt={n.title} className="w-full h-44 object-cover" />}
                <div className="p-4">
                  <span className="text-xs text-vm-accent font-semibold uppercase tracking-wider">{n.category}</span>
                  <h3 className="font-heading font-bold text-vm-ink mt-1 line-clamp-2 group-hover:text-vm-green">{n.title}</h3>
                  <p className="text-sm text-slate-500 mt-1 line-clamp-2">{n.excerpt}</p>
                  <p className="text-xs text-slate-400 mt-2">{new Date(n.publish_date).toLocaleDateString()}</p>
                </div>
              </Link>
            ))}
          </div>}
      </div>
    </div>
  );
}

export function NewsArticle() {
  const { slug } = useParams();
  const { data: a } = useQuery({ queryKey: ["article", slug], queryFn: async () => (await api.get(`/news/${slug}`)).data });
  if (!a) return <div className="vm-container py-20 text-center text-slate-400">Loading...</div>;
  return (
    <div className="vm-container py-10 max-w-3xl">
      <SEO title={a.title} description={a.excerpt} ogImage={a.featured_image} seo={a.seo} />
      <p className="text-xs text-vm-accent font-semibold uppercase tracking-wider">{a.category}</p>
      <h1 className="font-heading text-3xl md:text-4xl font-bold text-vm-ink mt-2 tracking-tight">{a.title}</h1>
      <p className="text-sm text-slate-400 mt-2">By {a.author} · {new Date(a.publish_date).toLocaleDateString()}</p>
      {a.featured_image && <img src={mediaUrl(a.featured_image)} alt={a.title} className="w-full h-72 object-cover rounded-lg mt-6" />}
      <div className="prose-vm mt-6 text-slate-600 leading-relaxed whitespace-pre-line">{a.content}</div>
      {a.related?.length > 0 && (
        <div className="mt-12 border-t pt-8">
          <h2 className="font-heading text-xl font-bold text-vm-ink mb-4">Related Articles</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {a.related.map((r) => (
              <Link key={r.id} to={`/news/${r.slug}`} className="border border-[#E2E8F0] rounded-lg p-3 hover:border-vm-accent">
                <h4 className="font-medium text-vm-ink text-sm line-clamp-2">{r.title}</h4>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
