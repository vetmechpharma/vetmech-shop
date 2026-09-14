import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, mediaUrl, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import ImageUpload from "@/components/admin/ImageUpload";
import { toast } from "sonner";
import { CUSTOMER_CATEGORIES } from "@/lib/constants";
import { Plus, Pencil, Trash2, Loader2, X, IndianRupee, Gift } from "lucide-react";

const BADGES = ["new", "featured", "best_seller", "offer", "out_of_stock", "coming_soon"];
const STOCK = [{ value: "in_stock", label: "In Stock" }, { value: "out_of_stock", label: "Out of Stock" }, { value: "coming_soon", label: "Coming Soon" }];
const GST = [0, 5, 12, 18];
const PRICING_CATS = ["doctor", "agency", "medical_shop", "distributor", "farm", "other"];
const catLabel = (v) => CUSTOMER_CATEGORIES.find((c) => c.value === v)?.label || v;
const emptyVariant = () => ({ pack_size: "", unit: "Bottle", sku: "", mrp: 0, selling_price: 0, gst_percent: 12, gst_inclusive: true, stock_status: "in_stock", min_order_qty: 1, max_order_qty: 0, units_per_case: 0, images: [], category_prices: {}, offers: [] });
const newOffer = () => ({ scheme_type: "free_qty", buy_quantity: "", free_quantity: "", special_price: "", min_quantity: "", customer_type: "all", name: "" });

function offerLabel(o) {
  if (o.scheme_type === "free_qty") return `Buy ${o.buy_quantity} Get ${o.free_quantity} Free`;
  if (o.scheme_type === "case_price") return `Case @ ₹${o.special_price} (min ${o.min_quantity || o.buy_quantity})`;
  return `${o.min_quantity || ""} @ ₹${o.special_price}`;
}

export default function AdminProducts() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletedOffers, setDeletedOffers] = useState([]);

  const { data: list, isLoading } = useQuery({ queryKey: ["admin-products", q], queryFn: async () => (await api.get("/admin/products", { params: { q: q || undefined, limit: 100 } })).data });
  const { data: cats } = useQuery({ queryKey: ["admin-categories"], queryFn: async () => (await api.get("/admin/categories")).data });
  const { data: brands } = useQuery({ queryKey: ["admin-brands"], queryFn: async () => (await api.get("/admin/brands")).data });
  const { data: units } = useQuery({ queryKey: ["units"], queryFn: async () => (await api.get("/units")).data });

  const toggleActive = useMutation({
    mutationFn: async (p) => (await api.put(`/admin/products/${p.id}`, { ...p, active: !p.active })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-products"] }); toast.success("Status updated"); },
    onError: (e) => toast.error(apiError(e)),
  });

  const openNew = () => { setEditing(null); setDeletedOffers([]); setForm({ active: true, badges: {}, variants: [emptyVariant()], images: [], related_product_ids: [], seo: {} }); setOpen(true); };
  const openEdit = async (row) => {
    const full = (await api.get(`/admin/products/${row.id}`)).data;
    const variants = (full.variants?.length ? full.variants : [emptyVariant()]).map((v) => ({ ...v, category_prices: {}, offers: [] }));
    // Load pricing matrix + offers
    try {
      const pm = (await api.get(`/admin/pricing/product/${row.id}`)).data;
      pm.variants.forEach((pv) => {
        const target = variants.find((v) => v.id === pv.variant_id);
        if (target) target.category_prices = { ...pv.category_prices };
      });
      await Promise.all(variants.filter((v) => v.id).map(async (v) => {
        const of = (await api.get(`/admin/pricing/offers/${v.id}`)).data;
        v.offers = of.items || [];
      }));
    } catch { /* ignore pricing load errors */ }
    setEditing(full); setDeletedOffers([]);
    setForm({ ...full, badges: full.badges || {}, variants, images: full.images || [], seo: full.seo || {} });
    setOpen(true);
  };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setVariant = (i, k, v) => setForm((f) => { const vs = [...f.variants]; vs[i] = { ...vs[i], [k]: v }; return { ...f, variants: vs }; });
  const setCatPrice = (i, cat, v) => setForm((f) => { const vs = [...f.variants]; vs[i] = { ...vs[i], category_prices: { ...vs[i].category_prices, [cat]: v } }; return { ...f, variants: vs }; });
  const addOffer = (i) => setForm((f) => { const vs = [...f.variants]; vs[i] = { ...vs[i], offers: [...(vs[i].offers || []), newOffer()] }; return { ...f, variants: vs }; });
  const setOffer = (i, oi, k, v) => setForm((f) => { const vs = [...f.variants]; const offs = [...vs[i].offers]; offs[oi] = { ...offs[oi], [k]: v }; vs[i] = { ...vs[i], offers: offs }; return { ...f, variants: vs }; });
  const removeOffer = (i, oi) => setForm((f) => { const vs = [...f.variants]; const off = vs[i].offers[oi]; if (off.id) setDeletedOffers((d) => [...d, off.id]); vs[i] = { ...vs[i], offers: vs[i].offers.filter((_, x) => x !== oi) }; return { ...f, variants: vs }; });
  const catName = (id) => cats?.find((c) => c.id === id)?.name || "—";

  const persistPricing = async (savedProduct) => {
    const savedVariants = savedProduct.variants || [];
    const prices = [];
    (form.variants || []).forEach((fv, i) => {
      const vid = savedVariants[i]?.id;
      if (!vid) return;
      PRICING_CATS.forEach((cat) => {
        const raw = fv.category_prices?.[cat];
        prices.push({ variant_id: vid, category: cat, rate: raw === "" || raw == null ? null : Number(raw) });
      });
    });
    if (prices.length) await api.put(`/admin/pricing/product/${savedProduct.id}`, { prices });
    // Create new offers
    for (let i = 0; i < (form.variants || []).length; i++) {
      const vid = savedVariants[i]?.id;
      if (!vid) continue;
      for (const o of form.variants[i].offers || []) {
        if (o.id) continue;
        await api.post("/admin/pricing/offers", {
          product_id: savedProduct.id, variant_id: vid, scheme_type: o.scheme_type,
          buy_quantity: o.buy_quantity ? Number(o.buy_quantity) : null,
          free_quantity: o.free_quantity ? Number(o.free_quantity) : null,
          special_price: o.special_price !== "" && o.special_price != null ? Number(o.special_price) : null,
          min_quantity: o.min_quantity ? Number(o.min_quantity) : null,
          customer_type: o.customer_type || "all", name: o.name || offerLabel(o), active: true,
        });
      }
    }
    for (const oid of deletedOffers) { try { await api.delete(`/admin/pricing/offers/${oid}`); } catch { /* ignore */ } }
  };

  const submit = async () => {
    if (!form.name) { toast.error("Product name required"); return; }
    setSaving(true);
    try {
      const brand = brands?.find((b) => b.id === form.brand_id);
      const payload = { ...form, brand_name: brand?.name || form.brand_name || "" };
      const saved = editing
        ? (await api.put(`/admin/products/${editing.id}`, payload)).data
        : (await api.post("/admin/products", payload)).data;
      await persistPricing(saved);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      setOpen(false);
      toast.success("Product & pricing saved");
    } catch (e) { toast.error(apiError(e)); }
    setSaving(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div><h1 className="font-heading text-2xl font-bold text-vm-ink">Products</h1><p className="text-slate-500 text-sm">Manage products, variants, pricing & schemes</p></div>
        <div className="flex gap-2">
          <Input placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} className="w-48" data-testid="product-search" />
          <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={openNew} data-testid="add-product"><Plus className="w-4 h-4 mr-2" /> Add Product</Button>
        </div>
      </div>

      <div className="border border-[#E2E8F0] rounded-lg overflow-x-auto bg-white">
        <Table>
          <TableHeader><TableRow className="bg-vm-bg">
            <TableHead>Image</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Variants</TableHead><TableHead>Active</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></TableCell></TableRow>
              : (list?.items || []).map((p) => (
                <TableRow key={p.id} data-testid={`product-row-${p.id}`}>
                  <TableCell>{p.image ? <img src={mediaUrl(p.image)} alt="" className="w-10 h-10 object-contain bg-[#F8FAF9] rounded" /> : "—"}</TableCell>
                  <TableCell><span className="font-medium text-vm-ink">{p.name}</span><br /><span className="text-xs text-slate-400">{p.product_code}</span></TableCell>
                  <TableCell className="text-sm">{catName(p.category_id)}</TableCell>
                  <TableCell className="text-sm">{p.variants?.length || 0}</TableCell>
                  <TableCell><Switch checked={!!p.active} onCheckedChange={() => toggleActive.mutate(p)} data-testid={`toggle-active-${p.id}`} /></TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)} data-testid={`edit-product-${p.id}`}><Pencil className="w-4 h-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="product-dialog">
          <DialogHeader><DialogTitle className="font-heading">{editing ? "Edit" : "Add"} Product</DialogTitle><DialogDescription className="sr-only">Product details, variants, pricing, badges and SEO</DialogDescription></DialogHeader>
          <Tabs defaultValue="basic">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="variants">Variants</TabsTrigger>
              <TabsTrigger value="pricing" data-testid="tab-pricing">Pricing & Offers</TabsTrigger>
              <TabsTrigger value="badges">Badges & Media</TabsTrigger>
              <TabsTrigger value="seo">SEO</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="grid sm:grid-cols-2 gap-4 mt-4">
              <div className="sm:col-span-2"><Label>Product Name</Label><Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} data-testid="pf-name" /></div>
              <div><Label>Product Code</Label><Input value={form.product_code || ""} onChange={(e) => set("product_code", e.target.value)} /></div>
              <div><Label>SKU</Label><Input value={form.sku || ""} onChange={(e) => set("sku", e.target.value)} /></div>
              <div><Label>Brand</Label>
                <Select value={form.brand_id || ""} onValueChange={(v) => set("brand_id", v)}><SelectTrigger data-testid="pf-brand"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{(brands || []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div><Label>Category</Label>
                <Select value={form.category_id || ""} onValueChange={(v) => set("category_id", v)}><SelectTrigger data-testid="pf-category"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{(cats || []).filter((c) => !c.parent_id).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div><Label>Subcategory</Label>
                <Select value={form.subcategory_id || ""} onValueChange={(v) => set("subcategory_id", v)}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{(cats || []).filter((c) => c.parent_id === form.category_id).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="sm:col-span-2"><Label>Short Description</Label><Textarea value={form.short_description || ""} onChange={(e) => set("short_description", e.target.value)} /></div>
              <div className="flex items-center justify-between sm:col-span-2 border rounded-md px-3 py-2"><Label>Active (visible on site)</Label><Switch checked={!!form.active} onCheckedChange={(v) => set("active", v)} data-testid="pf-active" /></div>
            </TabsContent>

            <TabsContent value="details" className="space-y-3 mt-4">
              <p className="text-xs text-slate-400">Empty sections are automatically hidden on the product page.</p>
              {[["full_description", "Full Description"], ["composition", "Composition"], ["indications", "Indications"], ["dosage", "Dosage"], ["benefits", "Benefits"], ["precautions", "Precautions"], ["storage", "Storage"], ["additional_info", "Additional Information"]].map(([k, l]) => (
                <div key={k}><Label>{l}</Label><Textarea value={form[k] || ""} onChange={(e) => set(k, e.target.value)} /></div>
              ))}
            </TabsContent>

            <TabsContent value="variants" className="space-y-4 mt-4">
              {(form.variants || []).map((v, i) => (
                <div key={i} className="border border-[#E2E8F0] rounded-lg p-3 relative">
                  {form.variants.length > 1 && <button onClick={() => set("variants", form.variants.filter((_, x) => x !== i))} className="absolute top-2 right-2 text-red-400"><X className="w-4 h-4" /></button>}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div><Label className="text-xs">Pack Size</Label><Input value={v.pack_size} onChange={(e) => setVariant(i, "pack_size", e.target.value)} data-testid={`vf-pack-${i}`} /></div>
                    <div><Label className="text-xs">Unit</Label>
                      <Select value={v.unit} onValueChange={(val) => setVariant(i, "unit", val)}><SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{(units || []).map((u) => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label className="text-xs">SKU</Label><Input value={v.sku} onChange={(e) => setVariant(i, "sku", e.target.value)} /></div>
                    <div><Label className="text-xs">Stock</Label>
                      <Select value={v.stock_status} onValueChange={(val) => setVariant(i, "stock_status", val)}><SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{STOCK.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label className="text-xs">MRP</Label><Input type="number" value={v.mrp} onChange={(e) => setVariant(i, "mrp", Number(e.target.value))} /></div>
                    <div><Label className="text-xs">Selling Price</Label><Input type="number" value={v.selling_price} onChange={(e) => setVariant(i, "selling_price", Number(e.target.value))} data-testid={`vf-price-${i}`} /></div>
                    <div><Label className="text-xs">GST %</Label>
                      <Select value={String(v.gst_percent)} onValueChange={(val) => setVariant(i, "gst_percent", Number(val))}><SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{GST.map((g) => <SelectItem key={g} value={String(g)}>{g}%</SelectItem>)}</SelectContent></Select></div>
                    <div><Label className="text-xs">Min Order Qty</Label><Input type="number" value={v.min_order_qty} onChange={(e) => setVariant(i, "min_order_qty", Number(e.target.value))} /></div>
                    <div><Label className="text-xs">Units per Case</Label><Input type="number" value={v.units_per_case || 0} onChange={(e) => setVariant(i, "units_per_case", Number(e.target.value))} data-testid={`vf-case-${i}`} /></div>
                  </div>
                  <div className="flex items-center gap-2 mt-2"><Switch checked={!!v.gst_inclusive} onCheckedChange={(val) => setVariant(i, "gst_inclusive", val)} /><span className="text-xs text-slate-500">GST Inclusive</span></div>
                  <div className="mt-3">
                    <Label className="text-xs">Variant Images (shown in order)</Label>
                    <div className="flex flex-wrap gap-2 mt-1 mb-1">
                      {(v.images || []).map((img, xi) => (
                        <div key={xi} className="relative w-14 h-14 bg-[#F8FAF9] rounded border p-1">
                          <img src={mediaUrl(img)} alt="" className="w-full h-full object-contain" />
                          <button onClick={() => setVariant(i, "images", v.images.filter((_, k) => k !== xi))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 grid place-items-center"><X className="w-3 h-3" /></button>
                        </div>
                      ))}
                    </div>
                    <ImageUpload label="" value="" square testid={`vf-img-${i}`} onChange={(url) => url && setVariant(i, "images", [...(v.images || []), url])} />
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => set("variants", [...form.variants, emptyVariant()])} data-testid="add-variant"><Plus className="w-4 h-4 mr-1" /> Add Variant</Button>
            </TabsContent>

            <TabsContent value="pricing" className="space-y-5 mt-4">
              <p className="text-xs text-slate-500 flex items-center gap-1.5"><IndianRupee className="w-3.5 h-3.5 text-vm-green" /> Set category-wise rates and offers per variant. Leave a rate blank to fall back to the public selling price. Saved together with the product.</p>
              {(form.variants || []).map((v, i) => (
                <div key={i} className="border border-[#E2E8F0] rounded-lg p-4" data-testid={`pricing-variant-${i}`}>
                  <p className="font-heading font-semibold text-vm-ink text-sm mb-1">{v.pack_size || "Variant " + (i + 1)} {v.unit} <span className="text-slate-400 font-normal">· MRP ₹{v.mrp || 0} · Public ₹{v.selling_price || 0}</span></p>

                  <Label className="text-xs mt-3 block mb-1.5 text-slate-500">Category Rates</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {PRICING_CATS.map((cat) => (
                      <div key={cat}>
                        <Label className="text-[11px] text-slate-400">{catLabel(cat)}</Label>
                        <Input type="number" placeholder="—" value={v.category_prices?.[cat] ?? ""} onChange={(e) => setCatPrice(i, cat, e.target.value)} data-testid={`catprice-${i}-${cat}`} className="h-9" />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between mt-4 mb-1.5">
                    <Label className="text-xs text-slate-500 flex items-center gap-1"><Gift className="w-3.5 h-3.5 text-vm-accent" /> Offers / Schemes</Label>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addOffer(i)} data-testid={`add-offer-${i}`}><Plus className="w-3 h-3 mr-1" /> Add Offer</Button>
                  </div>
                  <div className="space-y-2">
                    {(v.offers || []).length === 0 && <p className="text-xs text-slate-400">No offers on this variant.</p>}
                    {(v.offers || []).map((o, oi) => (
                      <div key={oi} className="border border-vm-border rounded-lg p-2.5 bg-vm-bg/40" data-testid={`offer-${i}-${oi}`}>
                        {o.id ? (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-vm-ink"><b>{offerLabel(o)}</b> <span className="text-xs text-slate-400">· {o.customer_type === "all" ? "All customers" : catLabel(o.customer_type)}</span></span>
                            <button onClick={() => removeOffer(i, oi)} className="text-red-400" data-testid={`remove-offer-${i}-${oi}`}><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                            <div>
                              <Label className="text-[11px] text-slate-400">Type</Label>
                              <Select value={o.scheme_type} onValueChange={(val) => setOffer(i, oi, "scheme_type", val)}><SelectTrigger className="h-9" data-testid={`offer-type-${i}-${oi}`}><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="free_qty">Buy X Get Y Free</SelectItem><SelectItem value="special_price">Special Price</SelectItem><SelectItem value="case_price">Case Price</SelectItem></SelectContent></Select>
                            </div>
                            {o.scheme_type === "free_qty" ? (
                              <>
                                <div><Label className="text-[11px] text-slate-400">Buy Qty</Label><Input type="number" value={o.buy_quantity} onChange={(e) => setOffer(i, oi, "buy_quantity", e.target.value)} className="h-9" data-testid={`offer-buy-${i}-${oi}`} /></div>
                                <div><Label className="text-[11px] text-slate-400">Free Qty</Label><Input type="number" value={o.free_quantity} onChange={(e) => setOffer(i, oi, "free_quantity", e.target.value)} className="h-9" data-testid={`offer-free-${i}-${oi}`} /></div>
                              </>
                            ) : (
                              <>
                                <div><Label className="text-[11px] text-slate-400">Special ₹</Label><Input type="number" value={o.special_price} onChange={(e) => setOffer(i, oi, "special_price", e.target.value)} className="h-9" data-testid={`offer-special-${i}-${oi}`} /></div>
                                <div><Label className="text-[11px] text-slate-400">Min Qty</Label><Input type="number" value={o.min_quantity} onChange={(e) => setOffer(i, oi, "min_quantity", e.target.value)} className="h-9" /></div>
                              </>
                            )}
                            <div className="flex items-end gap-1">
                              <div className="flex-1">
                                <Label className="text-[11px] text-slate-400">For</Label>
                                <Select value={o.customer_type} onValueChange={(val) => setOffer(i, oi, "customer_type", val)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                  <SelectContent><SelectItem value="all">All</SelectItem>{PRICING_CATS.map((c) => <SelectItem key={c} value={c}>{catLabel(c)}</SelectItem>)}</SelectContent></Select>
                              </div>
                              <button onClick={() => removeOffer(i, oi)} className="text-red-400 pb-2"><X className="w-4 h-4" /></button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="badges" className="space-y-4 mt-4">
              <div>
                <Label className="mb-2 block">Badges</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {BADGES.map((b) => (
                    <label key={b} className="flex items-center justify-between border rounded-md px-3 py-2">
                      <span className="text-sm capitalize">{b.replace("_", " ")}</span>
                      <Switch checked={!!form.badges?.[b]} onCheckedChange={(v) => set("badges", { ...form.badges, [b]: v })} data-testid={`badge-${b}`} />
                    </label>
                  ))}
                </div>
              </div>
              <ImageUpload label="Main Image" value={form.image} onChange={(v) => set("image", v)} testid="pf-image" square />
              <div>
                <Label className="mb-2 block">Additional Images</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {(form.images || []).map((img, i) => (
                    <div key={i} className="relative w-16 h-16 bg-[#F8FAF9] rounded border p-1"><img src={mediaUrl(img)} alt="" className="w-full h-full object-contain" /><button onClick={() => set("images", form.images.filter((_, x) => x !== i))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 grid place-items-center"><X className="w-3 h-3" /></button></div>
                  ))}
                </div>
                <ImageUpload label="" value="" square onChange={(v) => v && set("images", [...(form.images || []), v])} />
              </div>
              <ImageUpload label="Brochure (PDF)" value={form.brochure_url} onChange={(v) => set("brochure_url", v)} isPdf accept="application/pdf" />
              <ImageUpload label="Visual Aid (PDF)" value={form.visual_aid_url} onChange={(v) => set("visual_aid_url", v)} isPdf accept="application/pdf" />
              <p className="text-xs text-slate-400 border-t pt-3">Related products are shown automatically based on the product's category — no manual selection needed.</p>
            </TabsContent>

            <TabsContent value="seo" className="space-y-3 mt-4">
              <div><Label>URL Slug</Label><Input value={form.slug || ""} onChange={(e) => set("slug", e.target.value)} placeholder="auto-generated if empty" /></div>
              <div><Label>SEO Title</Label><Input value={form.seo?.title || ""} onChange={(e) => set("seo", { ...form.seo, title: e.target.value })} /></div>
              <div><Label>Meta Description</Label><Textarea value={form.seo?.meta_description || ""} onChange={(e) => set("seo", { ...form.seo, meta_description: e.target.value })} /></div>
              <div><Label>Meta Keywords</Label><Input value={form.seo?.meta_keywords || ""} onChange={(e) => set("seo", { ...form.seo, meta_keywords: e.target.value })} /></div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={submit} disabled={saving} data-testid="save-product">{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Product</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
