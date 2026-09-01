import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import SEO from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Zap, Search, Plus, Minus, ShoppingCart, Lock, Loader2 } from "lucide-react";

function Row({ p, v, addItem, loggedIn }) {
  const [qty, setQty] = useState(v.min_order_qty || 1);
  const offer = (v.active_schemes || [])[0];
  const add = () => { addItem(v.id, qty, { name: p.name, pack: v.pack_size }); toast.success(`Added ${qty} × ${p.name}`); };
  return (
    <div className="flex items-center gap-3 py-3 px-3 md:px-4 border-b border-vm-border hover:bg-vm-bg/60 transition-colors" data-testid={`qo-row-${v.id}`}>
      <img src={p.image || "/placeholder.png"} alt={p.name} className="w-12 h-12 rounded-lg object-cover bg-slate-100 shrink-0 hidden sm:block" />
      <div className="flex-1 min-w-0">
        <Link to={`/products/${p.slug}`} className="font-medium text-vm-ink hover:text-vm-green truncate block">{p.name}</Link>
        <p className="text-xs text-slate-500">{v.pack_size} {v.unit}{p.brand_name ? ` · ${p.brand_name}` : ""}</p>
      </div>
      <div className="text-right w-24 hidden md:block">
        {v.your_price != null ? <span className="font-semibold text-vm-green">₹{v.your_price}</span>
          : v.login_required ? <span className="text-xs text-slate-500">MRP ₹{v.mrp}</span>
            : <span className="font-semibold text-vm-ink">₹{v.selling_price}</span>}
      </div>
      <div className="w-24 text-center hidden md:block">
        {offer ? <span className="text-[11px] font-semibold text-vm-accent bg-vm-accent/10 px-2 py-0.5 rounded">{offer.type === "special_price" ? `${offer.min}@₹${offer.special_price}` : `${offer.buy}+${offer.free}`}</span> : <span className="text-slate-300">—</span>}
      </div>
      <div className="flex items-center border border-vm-border rounded-lg overflow-hidden">
        <button className="px-2 py-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus className="w-3.5 h-3.5" /></button>
        <Input type="number" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} className="w-14 h-8 border-0 text-center p-0 focus-visible:ring-0" data-testid={`qo-qty-${v.id}`} />
        <button className="px-2 py-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setQty((q) => q + 1)}><Plus className="w-3.5 h-3.5" /></button>
      </div>
      <Button size="sm" className="bg-vm-green hover:bg-vm-greenhover shrink-0" onClick={add} data-testid={`qo-add-${v.id}`}><ShoppingCart className="w-4 h-4 md:mr-1" /><span className="hidden md:inline">Add</span></Button>
    </div>
  );
}

export default function QuickOrder() {
  const { addItem, count, setOpen } = useCart();
  const { customer } = useAuth();
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["quick-order"], queryFn: async () => (await api.get("/products", { params: { limit: 200 } })).data });

  const rows = useMemo(() => {
    const items = data?.items || [];
    const flat = [];
    items.forEach((p) => (p.variants || []).forEach((v) => flat.push({ p, v })));
    if (!q.trim()) return flat;
    const t = q.toLowerCase();
    return flat.filter(({ p }) => p.name.toLowerCase().includes(t) || (p.brand_name || "").toLowerCase().includes(t));
  }, [data, q]);

  return (
    <div className="vm-container py-8 max-w-5xl">
      <SEO title="Quick Order" description="Fast bulk ordering — add every product in one scroll." />
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-vm-green/10 grid place-items-center"><Zap className="w-5 h-5 text-vm-green" /></div>
          <div><h1 className="font-heading text-3xl font-bold text-vm-ink">Quick Order</h1><p className="text-slate-500">Add quantities inline — no need to open each product</p></div>
        </div>
        <Button variant="outline" onClick={() => setOpen(true)} data-testid="qo-view-cart"><ShoppingCart className="w-4 h-4 mr-2" /> Cart ({count})</Button>
      </div>

      {!customer && (
        <div className="flex items-center gap-2 text-sm bg-vm-accent/10 border border-vm-accent/30 rounded-lg px-4 py-2.5 mb-4 text-vm-ink" data-testid="qo-login-banner">
          <Lock className="w-4 h-4 text-vm-accent" /> Prices and offers are shown after login. <Link to="/account" className="font-semibold text-vm-green hover:underline">Login</Link>
        </div>
      )}

      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Search products by name or brand..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" data-testid="qo-search" />
      </div>

      <div className="bg-white border border-vm-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 py-2.5 px-3 md:px-4 bg-vm-bg text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-vm-border">
          <span className="hidden sm:block w-12"></span><span className="flex-1">Product</span>
          <span className="w-24 text-right hidden md:block">Price</span><span className="w-24 text-center hidden md:block">Offer</span>
          <span className="w-[112px] text-center">Qty</span><span className="w-[68px]"></span>
        </div>
        {isLoading ? <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-slate-400" /></div>
          : rows.length === 0 ? <div className="py-16 text-center text-slate-400">No products found.</div>
            : <div className="max-h-[65vh] overflow-y-auto">{rows.map(({ p, v }) => <Row key={v.id} p={p} v={v} addItem={addItem} loggedIn={!!customer} />)}</div>}
      </div>
    </div>
  );
}
