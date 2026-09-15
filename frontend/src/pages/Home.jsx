import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, mediaUrl } from "@/lib/api";
import { useSettings } from "@/hooks/useSettings";
import SEO from "@/components/SEO";
import ProductCard from "@/components/public/ProductCard";
import { Button } from "@/components/ui/button";
import * as Icons from "lucide-react";
import { ArrowRight, MessageCircle, ShieldCheck } from "lucide-react";

function Section({ children, className = "", alt = false }) {
  return <section className={`py-14 md:py-20 ${alt ? "bg-vm-bg" : "bg-white"} ${className}`}>{children}</section>;
}

export default function Home() {
  const { data: home } = useSettings("homepage");
  const { data: company } = useSettings("company");
  const { data: cats } = useQuery({ queryKey: ["categories"], queryFn: async () => (await api.get("/categories")).data });
  const { data: featured } = useQuery({ queryKey: ["home-featured"], queryFn: async () => (await api.get("/products", { params: { badge: "featured", limit: 4 } })).data });
  const featIds = home?.featured_product_ids || [];
  const { data: selFeatured } = useQuery({ queryKey: ["home-featured-sel", featIds.join(",")], enabled: featIds.length > 0, queryFn: async () => (await api.get(`/products/by-ids`, { params: { ids: featIds.join(",") } })).data });
  const featuredList = (selFeatured && selFeatured.length) ? selFeatured : (featured?.items || []);
  const { data: newLaunch } = useQuery({ queryKey: ["home-new"], queryFn: async () => (await api.get("/products", { params: { badge: "new", limit: 4 } })).data });
  const { data: offers } = useQuery({ queryKey: ["home-offer"], queryFn: async () => (await api.get("/products", { params: { badge: "offer", limit: 4 } })).data });
  const { data: news } = useQuery({ queryKey: ["home-news"], queryFn: async () => (await api.get("/news", { params: { limit: 3 } })).data });
  const { data: gallery } = useQuery({ queryKey: ["home-gallery"], queryFn: async () => (await api.get("/gallery")).data });
  const { data: siteReviews } = useQuery({ queryKey: ["site-reviews"], queryFn: async () => (await api.get("/reviews", { params: { kind: "site" } })).data });

  const orgLd = siteReviews?.count > 0 ? { "@context": "https://schema.org", "@type": "Organization", name: company?.name || "VETMECH Pharmaceuticals", aggregateRating: { "@type": "AggregateRating", ratingValue: siteReviews.average, reviewCount: siteReviews.count } } : null;

  const topCats = (cats || []).filter((c) => !c.parent_id);
  const hero = home?.hero || {};
  const waNumber = company?.whatsapp || "919825000000";

  return (
    <div>
      <SEO title={home?.hero?.title || "VETMECH Pharmaceuticals"} description={home?.intro?.text} ogImage={hero.image} jsonLd={orgLd} />

      {/* HERO */}
      <section className="relative bg-vm-ink text-white overflow-hidden">
        {hero.image && <img src={mediaUrl(hero.image)} alt="VETMECH" className="absolute inset-0 w-full h-full object-cover" />}
        <div className="absolute inset-0 hero-overlay" />
        <div className="vm-container relative py-20 md:py-32 max-w-2xl vm-fade-up">
          <span className="inline-flex items-center gap-2 text-xs uppercase tracking-widest bg-white/10 border border-white/20 rounded-full px-3 py-1 mb-5">
            <ShieldCheck className="w-3.5 h-3.5 text-vm-accent" /> WHO-GMP Certified
          </span>
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">
            {hero.title || "Advancing Animal Health Across India"}
          </h1>
          <p className="mt-5 text-base md:text-lg text-slate-200 leading-relaxed">
            {hero.subtitle || "Quality-assured veterinary pharmaceuticals for cattle, companion animals and poultry."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={hero.cta_link || "/products"}>
              <Button size="lg" className="bg-vm-accent hover:bg-vm-accent/90" data-testid="hero-cta">
                {hero.cta_text || "Explore Products"} <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer">
              <Button size="lg" variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20" data-testid="hero-whatsapp">
                <MessageCircle className="w-4 h-4 mr-2" /> {hero.whatsapp_text || "Order on WhatsApp"}
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* INTRO */}
      {home?.intro && (
        <Section>
          <div className="vm-container grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="font-heading text-3xl sm:text-4xl font-bold text-vm-ink tracking-tight">{home.intro.title}</h2>
              <p className="mt-4 text-slate-600 leading-relaxed">{home.intro.text}</p>
              <Link to="/about"><Button variant="outline" className="mt-6 border-vm-green text-vm-green hover:bg-vm-bg">Learn more about us</Button></Link>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {(home.strengths || []).map((s, i) => {
                const Icon = Icons[s.icon] || ShieldCheck;
                return (
                  <div key={i} className="bg-vm-bg rounded-lg p-5 border border-[#E2E8F0]">
                    <div className="w-10 h-10 rounded-md bg-vm-green text-white grid place-items-center mb-3"><Icon className="w-5 h-5" /></div>
                    <h4 className="font-heading font-bold text-vm-ink">{s.title}</h4>
                    <p className="text-sm text-slate-500 mt-1">{s.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </Section>
      )}

      {/* CATEGORIES */}
      <Section alt>
        <div className="vm-container">
          <h2 className="font-heading text-3xl font-bold text-vm-ink text-center tracking-tight">Product Categories</h2>
          <p className="text-center text-slate-500 mt-2">Solutions for every animal segment</p>
          <div className="grid md:grid-cols-3 gap-6 mt-10">
            {topCats.map((c) => (
              <Link key={c.id} to={`/categories/${c.slug}`} className="group relative rounded-xl overflow-hidden h-56 border border-[#E2E8F0]" data-testid={`home-category-${c.slug}`}>
                {c.image && <img src={mediaUrl(c.image)} alt={c.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />}
                <div className="absolute inset-0 bg-gradient-to-t from-vm-ink/90 to-transparent" />
                <div className="absolute bottom-0 p-5 text-white">
                  <h3 className="font-heading text-xl font-bold">{c.name}</h3>
                  <p className="text-sm text-slate-200 line-clamp-1">{c.description}</p>
                  <span className="inline-flex items-center gap-1 text-sm text-vm-accent mt-2 font-medium">Browse <ArrowRight className="w-4 h-4" /></span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </Section>

      {/* FEATURED */}
      <ProductRow title="Featured Products" subtitle="Our most trusted formulations" data={featuredList} />

      {/* NEW LAUNCHES */}
      {newLaunch?.items?.length > 0 && <ProductRow title="New Launches" subtitle="Latest additions to our range" data={newLaunch.items} alt />}

      {/* OFFERS */}
      {offers?.items?.length > 0 && <ProductRow title="Offers & Schemes" subtitle="Bulk schemes for distributors and agencies" data={offers.items} />}

      {/* QUALITY */}
      {home?.quality && (
        <Section alt>
          <div className="vm-container grid md:grid-cols-2 gap-10 items-center">
            <div className="rounded-xl overflow-hidden border border-[#E2E8F0]">
              {home.quality.image && <img src={mediaUrl(home.quality.image)} alt="Quality" className="w-full h-72 object-cover" />}
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-vm-accent font-semibold">Quality & Manufacturing</span>
              <h2 className="font-heading text-3xl font-bold text-vm-ink mt-2 tracking-tight">{home.quality.title}</h2>
              <p className="mt-4 text-slate-600 leading-relaxed">{home.quality.text}</p>
              <Link to="/quality"><Button className="mt-6 bg-vm-green hover:bg-vm-greenhover">View Quality Standards</Button></Link>
            </div>
          </div>
        </Section>
      )}

      {/* NEWS */}
      {news?.items?.length > 0 && (
        <Section>
          <div className="vm-container">
            <div className="flex items-end justify-between mb-8">
              <div>
                <h2 className="font-heading text-3xl font-bold text-vm-ink tracking-tight">Latest News</h2>
                <p className="text-slate-500 mt-1">Updates from VETMECH</p>
              </div>
              <Link to="/news" className="text-vm-green font-medium hidden sm:inline-flex items-center gap-1">View all <ArrowRight className="w-4 h-4" /></Link>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {news.items.map((n) => (
                <Link key={n.id} to={`/news/${n.slug}`} className="group border border-[#E2E8F0] rounded-lg overflow-hidden hover:border-vm-accent transition-colors" data-testid={`home-news-${n.slug}`}>
                  {n.featured_image && <img src={mediaUrl(n.featured_image)} alt={n.title} className="w-full h-40 object-cover" />}
                  <div className="p-4">
                    <span className="text-xs text-vm-accent font-semibold uppercase tracking-wider">{n.category}</span>
                    <h3 className="font-heading font-bold text-vm-ink mt-1 line-clamp-2 group-hover:text-vm-green">{n.title}</h3>
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{n.excerpt}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* GALLERY */}
      {gallery?.length > 0 && (
        <Section alt>
          <div className="vm-container">
            <h2 className="font-heading text-3xl font-bold text-vm-ink text-center tracking-tight mb-8">Gallery Highlights</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {gallery.slice(0, 4).map((g) => (
                <div key={g.id} className="rounded-lg overflow-hidden border border-[#E2E8F0] aspect-video">
                  <img src={mediaUrl(g.image)} alt={g.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                </div>
              ))}
            </div>
            <div className="text-center mt-6"><Link to="/gallery"><Button variant="outline" className="border-vm-green text-vm-green">View Gallery</Button></Link></div>
          </div>
        </Section>
      )}

      {/* TESTIMONIALS */}
      {siteReviews?.items?.length > 0 && (
        <Section>
          <div className="vm-container">
            <div className="text-center mb-10">
              <h2 className="font-heading text-3xl font-bold text-vm-ink tracking-tight">What Our Partners Say</h2>
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="text-amber-400 text-lg" data-testid="testimonials-avg">{"★".repeat(Math.round(siteReviews.average))}{"☆".repeat(5 - Math.round(siteReviews.average))}</span>
                <span className="text-slate-500 text-sm">{siteReviews.average} out of 5 · {siteReviews.count} reviews</span>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {siteReviews.items.slice(0, 6).map((r) => (
                <div key={r.id} className="bg-vm-bg border border-[#E2E8F0] rounded-lg p-5" data-testid={`testimonial-${r.id}`}>
                  <span className="text-amber-400">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                  {r.title && <p className="font-heading font-bold text-vm-ink mt-2">{r.title}</p>}
                  <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{r.comment}</p>
                  <p className="text-sm font-medium text-vm-ink mt-3">— {r.name}{r.designation ? `, ${r.designation}` : ""}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* CTA */}
      <section className="bg-vm-green text-white">
        <div className="vm-container py-16 text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight">{home?.cta?.title || "Ready to place a bulk order?"}</h2>
          <p className="mt-3 text-slate-100 max-w-2xl mx-auto">{home?.cta?.text || "Add products to your cart and confirm instantly over WhatsApp. No online payment required."}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/products"><Button size="lg" className="bg-white text-vm-green hover:bg-slate-100">Browse Products</Button></Link>
            <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer"><Button size="lg" className="bg-vm-accent hover:bg-[#0C8A4F]"><MessageCircle className="w-4 h-4 mr-2" /> Contact Sales</Button></a>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProductRow({ title, subtitle, data, alt }) {
  if (!data || data.length === 0) return null;
  return (
    <Section alt={alt}>
      <div className="vm-container">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="font-heading text-3xl font-bold text-vm-ink tracking-tight">{title}</h2>
            <p className="text-slate-500 mt-1">{subtitle}</p>
          </div>
          <Link to="/products" className="text-vm-green font-medium hidden sm:inline-flex items-center gap-1">View all <ArrowRight className="w-4 h-4" /></Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {data.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </div>
    </Section>
  );
}
