import React, { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, mediaUrl } from "@/lib/api";
import SEO from "@/components/SEO";
import ProductBadges from "@/components/public/ProductBadges";
import ProductCard from "@/components/public/ProductCard";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, Minus, Plus, FileDown, Check, MessageCircle } from "lucide-react";

export default function ProductDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { data: p, isLoading } = useQuery({ queryKey: ["product", slug], queryFn: async () => (await api.get(`/products/${slug}`)).data });
  const [variantId, setVariantId] = useState(null);
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);

  if (isLoading) return <div className="vm-container py-10 grid md:grid-cols-2 gap-8"><Skeleton className="h-96 rounded-lg" /><div className="space-y-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24" /></div></div>;
  if (!p) return <div className="vm-container py-20 text-center text-slate-400">Product not found. <Link to="/products" className="text-vm-green underline">Back to products</Link></div>;

  const variants = p.variants || [];
  const variant = variants.find((v) => v.id === variantId) || variants[0] || {};
  const scheme = (variant.active_schemes || [])[0];
  const images = p.images?.length ? p.images : [p.image];
  const outOfStock = p.badges?.out_of_stock || variant.stock_status === "out_of_stock";
  const comingSoon = variant.stock_status === "coming_soon";

  const optional = [
    ["Composition", p.composition], ["Indications", p.indications], ["Dosage & Administration", p.dosage],
    ["Benefits", p.benefits], ["Precautions", p.precautions], ["Storage", p.storage],
    ["Additional Information", p.additional_info],
  ].filter(([, v]) => v && v.trim());

  const dispatchFree = scheme && scheme.type === "free_qty" && variant.min_order_qty
    ? Math.floor(qty / scheme.buy) * scheme.free : (scheme?.type === "free_qty" && qty >= scheme.buy ? Math.floor(qty / scheme.buy) * scheme.free : 0);

  return (
    <div className="vm-container py-8">
      <SEO title={p.name} description={p.short_description} ogImage={p.image} seo={p.seo} />
      <nav className="text-xs text-slate-400 mb-5">
        <Link to="/" className="hover:text-vm-green">Home</Link> / <Link to="/products" className="hover:text-vm-green">Products</Link> / <span className="text-vm-ink">{p.name}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-10">
        <div>
          <div className="relative bg-[#F8FAF9] border border-[#E2E8F0] rounded-lg aspect-square p-8">
            <ProductBadges badges={p.badges} className="absolute top-3 left-3 z-10" />
            <img src={mediaUrl(images[activeImg])} alt={p.name} className="w-full h-full object-contain" data-testid="product-main-image" />
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

          {variant.selling_price != null && (
            <div className="mt-4 flex items-baseline gap-2">
              <span className="font-heading text-2xl font-bold text-vm-green">₹{variant.selling_price}</span>
              {variant.mrp > variant.selling_price && <span className="text-slate-400 line-through text-sm">₹{variant.mrp}</span>}
              <span className="text-xs text-slate-400">/ {variant.pack_size}</span>
            </div>
          )}

          {/* Variant selector */}
          <div className="mt-5">
            <p className="text-sm font-medium text-vm-ink mb-2">Select Pack Size</p>
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => (
                <button key={v.id} onClick={() => setVariantId(v.id)}
                        className={`px-4 py-2 rounded-md border text-sm font-medium ${v.id === variant.id ? "border-vm-green bg-vm-green text-white" : "border-[#E2E8F0] text-slate-700 hover:border-vm-accent"}`}
                        data-testid={`variant-${v.sku}`}>
                  {v.pack_size} {v.unit}
                </button>
              ))}
            </div>
          </div>

          {scheme && (
            <div className="mt-4 bg-vm-bg border border-vm-accent/30 rounded-lg p-3 text-sm text-vm-green flex items-center gap-2" data-testid="product-scheme">
              <Check className="w-4 h-4" />
              {scheme.type === "special_price"
                ? <span>Special scheme: buy <strong>{scheme.min}</strong> at <strong>₹{scheme.special_price}</strong> each</span>
                : <span>Scheme <strong>{scheme.buy}+{scheme.free}</strong> — buy {scheme.buy}, get {scheme.free} free</span>}
            </div>
          )}

          {/* Qty + Add */}
          <div className="mt-5 flex items-center gap-3">
            <div className="flex items-center border border-[#E2E8F0] rounded-md">
              <button className="px-3 py-2 text-slate-500 hover:text-vm-green" onClick={() => setQty((q) => Math.max(variant.min_order_qty || 1, q - 1))} data-testid="qty-minus"><Minus className="w-4 h-4" /></button>
              <input value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} className="w-14 text-center outline-none" data-testid="qty-input" />
              <button className="px-3 py-2 text-slate-500 hover:text-vm-green" onClick={() => setQty((q) => q + 1)} data-testid="qty-plus"><Plus className="w-4 h-4" /></button>
            </div>
            {dispatchFree > 0 && <span className="text-sm text-vm-accent font-medium">+{dispatchFree} free → {qty + dispatchFree} dispatched</span>}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {comingSoon ? (
              <Button size="lg" disabled className="bg-slate-300">Coming Soon</Button>
            ) : outOfStock ? (
              <Button size="lg" disabled className="bg-red-100 text-red-700">Out of Stock</Button>
            ) : (
              <Button size="lg" className="bg-vm-green hover:bg-vm-greenhover" data-testid="detail-add-to-cart"
                      onClick={() => addItem(variant.id, qty, { name: p.name, pack: variant.pack_size })}>
                <ShoppingCart className="w-4 h-4 mr-2" /> Add to Cart
              </Button>
            )}
            <Button size="lg" variant="outline" className="border-vm-green text-vm-green" onClick={() => { addItem(variant.id, qty, { name: p.name }); navigate("/cart"); }} data-testid="buy-now">
              Buy Now
            </Button>
          </div>

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
    </div>
  );
}
