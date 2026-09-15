import React, { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, mediaUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import AuthDialog from "@/components/public/AuthDialog";
import SEO from "@/components/SEO";
import ProductBadges from "@/components/public/ProductBadges";
import ProductCard from "@/components/public/ProductCard";
import ProductReviews from "@/components/public/ProductReviews";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, Minus, Plus, FileDown, Check, MessageCircle, Lock, Tag } from "lucide-react";

function gcdN(a, b) { return b ? gcdN(b, a % b) : a; }
function simplifyRatio(b, f) { if (b > 0 && f > 0) { const g = gcdN(b, f); if (g > 1) return [b / g, f / g]; } return [b, f]; }
function pickBestOffer(schemes, qty, baseRate) {
  let best = null;
  for (const s of schemes || []) {
    if (s.max && qty > s.max) continue;
    if (s.type === "special_price" || s.type === "case_price") {
      const minq = s.min || 0;
      if (s.special_price == null || qty < (minq || 1)) continue;
      const eff = s.special_price;
      if (!best || eff < best.eff) best = { id: s.id, kind: "price", label: s.name || `${minq} @ ₹${s.special_price}`, free: 0, unit: s.special_price, eff };
    } else if (s.buy && s.free) {
      const [sb, sf] = simplifyRatio(s.buy, s.free);
      if (qty < sb) continue;
      const free = Math.floor(qty / sb) * sf;
      if (free <= 0) continue;
      const eff = baseRate != null ? (baseRate * qty) / (qty + free) : -free;
      if (!best || eff < best.eff) best = { id: s.id, kind: "free", label: `${sb}+${sf}`, free, unit: baseRate, eff, buy: sb, freePer: sf };
    }
  }
  return best;
}
function computeUpsellFE(schemes, qty, currentFree) {
  let best = null;
  for (const s of schemes || []) {
    if (!(s.type === "free_qty" || !s.type) || !s.buy || !s.free) continue;
    const [sb, sf] = simplifyRatio(s.buy, s.free);
    const thr = (Math.floor(qty / sb) + 1) * sb;
    if (s.max && thr > s.max) continue;
    const freeAt = (thr / sb) * sf;
    if (freeAt <= currentFree) continue;
    const add = thr - qty;
    if (!best || add < best.add) best = { add, target: thr, free: freeAt, label: `${sb}+${sf}` };
  }
  return best;
}

export default function ProductDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { addItem } = useCart();
  const { customer } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const { data: p, isLoading } = useQuery({ queryKey: ["product", slug], queryFn: async () => (await api.get(`/products/${slug}`)).data });
  const [variantId, setVariantId] = useState(null);
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);

  if (isLoading) return <div className="vm-container py-10 grid md:grid-cols-2 gap-8"><Skeleton className="h-96 rounded-lg" /><div className="space-y-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24" /></div></div>;
  if (!p) return <div className="vm-container py-20 text-center text-slate-400">Product not found. <Link to="/products" className="text-vm-green underline">Back to products</Link></div>;

  const variants = p.variants || [];
  const variant = variants.find((v) => v.id === variantId) || variants[0] || {};
  const images = (variant.images && variant.images.length) ? variant.images : (p.images?.length ? p.images : [p.image]);
  const schemes = variant.active_schemes || [];
  const outOfStock = p.badges?.out_of_stock || variant.stock_status === "out_of_stock";
  const comingSoon = variant.stock_status === "coming_soon";

  const optional = [
    ["Composition", p.composition], ["Indications", p.indications], ["Dosage & Administration", p.dosage],
    ["Benefits", p.benefits], ["Precautions", p.precautions], ["Storage", p.storage],
    ["Additional Information", p.additional_info],
  ].filter(([, v]) => v && v.trim());

  const baseRate = variant.your_price;
  const bestOffer = pickBestOffer(schemes, qty, baseRate);
  const dispatchFree = bestOffer?.free || 0;
  const netRate = bestOffer
    ? (bestOffer.kind === "price" ? bestOffer.unit : (dispatchFree ? Math.round((baseRate * qty / (qty + dispatchFree)) * 100) / 100 : baseRate))
    : baseRate;
  const upsell = computeUpsellFE(schemes, qty, dispatchFree);

  const reviewLd = p.review_count ? { "@type": "AggregateRating", ratingValue: p.review_avg, reviewCount: p.review_count } : null;
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Product",
    name: p.name, image: mediaUrl(images[0] || p.image), description: p.short_description || p.full_description || p.name,
    sku: variant.sku || p.product_code || "", brand: { "@type": "Brand", name: p.brand_name || "VETMECH" },
    offers: { "@type": "Offer", priceCurrency: "INR", price: variant.mrp || 0, availability: outOfStock ? "https://schema.org/OutOfStock" : "https://schema.org/InStock" },
    ...(reviewLd ? { aggregateRating: reviewLd } : {}),
  };

  return (
    <div className="vm-container py-8">
      <SEO title={p.name} description={p.short_description} ogImage={p.image} seo={p.seo} jsonLd={jsonLd} />
      <nav className="text-xs text-slate-400 mb-5">
        <Link to="/" className="hover:text-vm-green">Home</Link> / <Link to="/products" className="hover:text-vm-green">Products</Link> / <span className="text-vm-ink">{p.name}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-10">
        <div>
          <div className="relative bg-[#F8FAF9] border border-[#E2E8F0] rounded-lg aspect-square p-8">
            <ProductBadges badges={p.badges} className="absolute top-3 left-3 z-10" />
            <img src={mediaUrl(images[activeImg] || images[0])} alt={p.name} className="w-full h-full object-contain" data-testid="product-main-image" />
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 mt-3">
              {images.map((img, i) => (
                <button key={i} onClick={() => setActiveImg(i)} className={`w-16 h-16 bg-[#F8FAF9] rounded border p-1 ${activeImg === i ? "border-vm-accent" : "border-[#E2E8F0]"}`}>
                  <img src={mediaUrl(img)} alt="" className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs uppercase tracking-widest text-vm-accent font-semibold">{p.brand_name}{p.product_code && ` · ${p.product_code}`}</p>
          <h1 className="font-heading text-3xl font-bold text-vm-ink mt-1 tracking-tight" data-testid="product-title">{p.name}</h1>
          <p className="text-slate-600 mt-3">{p.short_description}</p>

          {variant.your_price != null ? (
                <div className="rounded-lg border border-vm-green/30 bg-vm-bg p-3 inline-block" data-testid="your-price-block">
                  <p className="text-[11px] uppercase tracking-widest text-vm-green font-bold flex items-center gap-1"><Tag className="w-3 h-3" /> Your Special Price</p>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="font-heading text-3xl font-bold text-vm-green">₹{variant.your_price}</span>
                    <span className="text-slate-400 line-through text-sm">MRP ₹{variant.mrp}</span>
                    <span className="text-xs text-slate-400">/ {variant.pack_size}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">MRP</span>
                    <span className="font-heading text-2xl font-bold text-vm-ink">₹{variant.mrp}</span>
                    <span className="text-xs text-slate-400">/ {variant.pack_size}</span>
                  </div>
                  {variant.login_required && (
                    <button onClick={() => setAuthOpen(true)} className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-vm-accent hover:underline" data-testid="login-for-price-btn">
                      <Lock className="w-3.5 h-3.5" /> Login to view your price &amp; offers
                    </button>
                  )}
                </div>
              )}

          {/* Variant selector */}
          <div className="mt-5">
            <p className="text-sm font-medium text-vm-ink mb-2">Select Pack Size</p>
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => (
                <button key={v.id} onClick={() => { setVariantId(v.id); setActiveImg(0); }}
                        className={`px-4 py-2 rounded-md border text-sm font-medium ${v.id === variant.id ? "border-vm-green bg-vm-green text-white" : "border-[#E2E8F0] text-slate-700 hover:border-vm-accent"}`}
                        data-testid={`variant-${v.sku}`}>
                  {v.pack_size} {v.unit}
                </button>
              ))}
            </div>
          </div>

          {schemes.length > 0 && (
            <div className="mt-4 space-y-2" data-testid="product-scheme">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Available Offers</p>
              {schemes.map((sc) => {
                const applied = bestOffer && bestOffer.id === sc.id;
                const isPrice = sc.type === "special_price" || sc.type === "case_price";
                const [sb, sf] = isPrice ? [0, 0] : simplifyRatio(sc.buy, sc.free);
                return (
                  <div key={sc.id} data-testid={`offer-${sc.id}`} className={`rounded-lg p-2.5 text-sm flex items-center gap-2 border ${applied ? "bg-vm-green/10 border-vm-green text-vm-green" : "bg-vm-bg border-[#E2E8F0] text-slate-600"}`}>
                    {applied ? <Check className="w-4 h-4 flex-shrink-0 text-vm-green" /> : <span className="w-3.5 h-3.5 flex-shrink-0 rounded-full border border-slate-300 inline-block" />}
                    <span className="flex-1">
                      {isPrice
                        ? <>{sc.name || "Offer"}: buy <strong>{sc.min}</strong>+ at <strong>₹{sc.special_price}</strong> each</>
                        : <>{sc.name || "Offer"}: <strong>{sb}+{sf}</strong> — buy {sb}, get {sf} free</>}
                    </span>
                    {applied && <span className="text-[11px] font-semibold bg-vm-green text-white px-1.5 py-0.5 rounded flex-shrink-0">Applied</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Qty + Add — only for logged-in registered customers */}
          {!customer ? (
            <div className="mt-6 rounded-xl border-2 border-vm-accent/40 bg-vm-accent/5 p-5" data-testid="login-to-order-card">
              <p className="font-heading text-lg font-bold text-vm-ink flex items-center gap-2"><Lock className="w-5 h-5 text-vm-accent" /> Login to View Your Prices</p>
              <p className="text-sm text-slate-600 mt-1">Your special B2B rates, quantity offers and ordering are available only to registered partners. It's quick — create your account and start ordering.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button size="lg" className="bg-vm-green hover:bg-vm-greenhover" data-testid="detail-register-btn"
                        onClick={() => navigate(`/register?redirect=${encodeURIComponent(`/products/${slug}`)}`)}>Create Account</Button>
                <Button size="lg" variant="outline" className="border-vm-green text-vm-green" data-testid="detail-login-btn"
                        onClick={() => navigate(`/account?redirect=${encodeURIComponent(`/products/${slug}`)}`)}>Login</Button>
              </div>
            </div>
          ) : (
          <>
          <div className="mt-5 flex items-center gap-3">
            <div className="flex items-center border border-[#E2E8F0] rounded-md">
              <button className="px-3 py-2 text-slate-500 hover:text-vm-green" onClick={() => setQty((q) => Math.max(variant.min_order_qty || 1, q - 1))} data-testid="qty-minus"><Minus className="w-4 h-4" /></button>
              <input value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} className="w-14 text-center outline-none" data-testid="qty-input" />
              <button className="px-3 py-2 text-slate-500 hover:text-vm-green" onClick={() => setQty((q) => q + 1)} data-testid="qty-plus"><Plus className="w-4 h-4" /></button>
            </div>
            {dispatchFree > 0 && <span className="text-sm text-vm-accent font-medium">+{dispatchFree} free → {qty + dispatchFree} dispatched</span>}
          </div>
          {bestOffer && netRate != null && (
            <p className="mt-2 text-sm text-slate-600" data-testid="net-rate">
              Net rate: <strong className="text-vm-ink">₹{netRate}</strong>/{variant.unit || "unit"}{variant.gst_percent ? ` + ${variant.gst_percent}% GST` : ""}
              {bestOffer.kind === "free" && dispatchFree > 0 && <span className="text-slate-400"> (₹{baseRate}×{qty} ÷ {qty + dispatchFree})</span>}
            </p>
          )}
          {upsell && (
            <div className="mt-2 flex items-center gap-2 text-sm text-vm-green bg-vm-bg border border-vm-green/20 rounded-md px-3 py-2" data-testid="product-upsell">
              <Plus className="w-3.5 h-3.5" /> Add <b>{upsell.add}</b> more to reach {upsell.target} and get <b>{upsell.free} free</b> ({upsell.label})
              <button onClick={() => setQty(upsell.target)} className="ml-auto text-xs font-semibold underline" data-testid="product-upsell-apply">Apply</button>
            </div>
          )}

          {variant.units_per_case > 0 && (
            <div className="mt-3 bg-vm-bg border border-[#E2E8F0] rounded-md px-3 py-2 text-sm text-slate-600 flex items-center gap-2 flex-wrap" data-testid="case-helper">
              <span>📦 1 Case = <strong className="text-vm-ink">{variant.units_per_case} {variant.unit}</strong></span>
              <button onClick={() => setQty(variant.units_per_case)} className="text-vm-green font-medium underline" data-testid="buy-case-btn">Buy 1 full case</button>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            {comingSoon ? (
              <Button size="lg" disabled className="bg-slate-300">Coming Soon</Button>
            ) : outOfStock ? (
              <Button size="lg" disabled className="bg-red-100 text-red-700">Out of Stock</Button>
            ) : (
              <Button size="lg" className="bg-vm-green hover:bg-vm-greenhover" data-testid="detail-add-to-cart"
                      onClick={() => addItem(variant.id, qty, { name: p.name, pack: variant.pack_size }, true)}>
                <ShoppingCart className="w-4 h-4 mr-2" /> Add to Cart
              </Button>
            )}
            <Button size="lg" variant="outline" className="border-vm-green text-vm-green" onClick={() => { addItem(variant.id, qty, { name: p.name }, true); navigate("/cart"); }} data-testid="buy-now">
              Buy Now
            </Button>
          </div>
          </>
          )}

          {p.brochure_url && (
            <a href={mediaUrl(p.brochure_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 mt-4 text-sm text-vm-green font-medium hover:underline" data-testid="download-brochure">
              <FileDown className="w-4 h-4" /> Download Brochure
            </a>
          )}
          {p.visual_aid_url && (
            <a href={mediaUrl(p.visual_aid_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 mt-4 ml-4 text-sm text-vm-green font-medium hover:underline">
              <FileDown className="w-4 h-4" /> Visual Aid
            </a>
          )}
        </div>
      </div>

      {/* Details */}
      {(p.full_description || optional.length > 0) && (
        <div className="mt-12 max-w-3xl">
          {p.full_description && (
            <div className="mb-6">
              <h2 className="font-heading text-xl font-bold text-vm-ink mb-2">Description</h2>
              <p className="text-slate-600 leading-relaxed whitespace-pre-line">{p.full_description}</p>
            </div>
          )}
          {optional.length > 0 && (
            <Accordion type="single" collapsible defaultValue="item-0" className="border border-[#E2E8F0] rounded-lg px-4">
              {optional.map(([label, value], i) => (
                <AccordionItem key={label} value={`item-${i}`}>
                  <AccordionTrigger className="font-heading font-semibold text-vm-ink">{label}</AccordionTrigger>
                  <AccordionContent><p className="text-slate-600 leading-relaxed whitespace-pre-line">{value}</p></AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      )}

      {/* Related */}
      {p.related?.length > 0 && (
        <div className="mt-14">
          <h2 className="font-heading text-2xl font-bold text-vm-ink mb-6">Related Products</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {p.related.map((rp) => <ProductCard key={rp.id} product={rp} />)}
          </div>
        </div>
      )}

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} onLoggedIn={() => qc.invalidateQueries({ queryKey: ["product", slug] })} />

      <ProductReviews productId={p.id} />
    </div>
  );
}
