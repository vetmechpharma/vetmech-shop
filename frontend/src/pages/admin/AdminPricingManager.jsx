import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Save, ChevronsUpDown, Package, User, Plus, Trash2, ShieldCheck, IndianRupee, Tag } from "lucide-react";
import { CUSTOMER_CATEGORIES } from "@/lib/constants";

const CAT_LABEL = (v) => CUSTOMER_CATEGORIES.find((c) => c.value === v)?.label || v;
const inr = (v) => v == null || v === "" ? "—" : "₹" + Number(v).toLocaleString("en-IN");

function SearchPicker({ endpoint, mapItem, placeholder, icon: Icon, onPick, value, testid }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data } = useQuery({ queryKey: [endpoint, q], queryFn: async () => (await api.get(endpoint, { params: { q: q || undefined, limit: 30 } })).data });
  const items = (data?.items || []).map(mapItem);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full sm:w-96 justify-between font-normal" data-testid={testid}>
          <span className="flex items-center gap-2 truncate"><Icon className="w-4 h-4 text-vm-green" /> {value || placeholder}</span>
          <ChevronsUpDown className="w-4 h-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-96" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Type to search..." value={q} onValueChange={setQ} data-testid={`${testid}-search`} />
          <CommandList><CommandEmpty>No results.</CommandEmpty><CommandGroup>
            {items.map((it) => <CommandItem key={it.id} value={it.id} onSelect={() => { onPick(it); setOpen(false); }}>
              <div><div className="text-sm text-vm-ink">{it.label}</div><div className="text-xs text-slate-500">{it.sub}</div></div>
            </CommandItem>)}
          </CommandGroup></CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CategoryPricing() {
  const qc = useQueryClient();
  const [product, setProduct] = useState(null);
  const [edits, setEdits] = useState({});
  const [preview, setPreview] = useState(null); // {changes, affected, mode}
  const [busy, setBusy] = useState(false);
  const [offersVariant, setOffersVariant] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ["cat-pricing", product?.id], queryFn: async () => (await api.get(`/admin/pricing/product/${product.id}`)).data, enabled: !!product });

  const key = (vid, cat) => `${vid}|${cat}`;
  const getVal = (vid, cat, current) => { const k = key(vid, cat); return edits[k] !== undefined ? edits[k] : (current ?? ""); };

  const changesFromEdits = () => Object.entries(edits).map(([k, rate]) => { const [variant_id, category] = k.split("|"); return { variant_id, category, rate: rate === "" ? null : Number(rate) }; });

  const plainSave = async (changes) => { await api.put(`/admin/pricing/product/${product.id}`, { prices: changes }); };

  const handleSave = async () => {
    setBusy(true);
    try {
      const changes = changesFromEdits();
      let affected = [];
      for (const c of changes) {
        if (c.rate == null) continue;
        const { data: pv } = await api.post("/admin/pricing/category-change/preview", { variant_id: c.variant_id, category: c.category, new_rate: c.rate });
        affected = affected.concat(pv.affected.map((a) => ({ ...a, category: c.category })));
      }
      if (affected.length) { setPreview({ changes, affected, mode: "keep_protected" }); }
      else { await plainSave(changes); finishSave(); }
    } catch (e) { toast.error(apiError(e)); }
    setBusy(false);
  };

  const applyMaster = async () => {
    setBusy(true);
    try {
      for (const c of preview.changes) {
        if (c.rate == null) await api.put(`/admin/pricing/product/${product.id}`, { prices: [c] });
        else await api.post("/admin/pricing/category-change/apply", { variant_id: c.variant_id, product_id: product.id, category: c.category, new_rate: c.rate, mode: preview.mode });
      }
      setPreview(null); finishSave();
    } catch (e) { toast.error(apiError(e)); }
    setBusy(false);
  };

  const finishSave = () => { setEdits({}); qc.invalidateQueries({ queryKey: ["cat-pricing", product.id] }); toast.success("Category prices saved"); };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchPicker endpoint="/admin/products" icon={Package} placeholder="Select a product" value={product?.name} testid="cat-product-picker"
          mapItem={(p) => ({ id: p.id, label: p.name, sub: p.brand_name, name: p.name })} onPick={(p) => { setProduct(p); setEdits({}); }} />
        {product && <Button className="bg-vm-green hover:bg-vm-greenhover ml-auto" onClick={handleSave} disabled={busy || !Object.keys(edits).length} data-testid="cat-save">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save{Object.keys(edits).length ? ` (${Object.keys(edits).length})` : ""}
        </Button>}
      </div>

      {!product ? <p className="text-slate-400 py-16 text-center">Search and select a product to manage its category-wise pricing.</p>
        : isLoading ? <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-slate-400" /></div>
          : (
            <div className="border border-[#E2E8F0] rounded-lg overflow-x-auto bg-white">
              <Table>
                <TableHeader><TableRow className="bg-vm-bg"><TableHead>Variant</TableHead><TableHead className="text-right">MRP</TableHead><TableHead className="text-right">Public</TableHead>
                  {data.categories.map((c) => <TableHead key={c} className="text-right">{CAT_LABEL(c)}</TableHead>)}<TableHead className="text-center">Offers</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.variants.map((v) => (
                    <TableRow key={v.variant_id} data-testid={`cat-variant-${v.variant_id}`}>
                      <TableCell className="font-medium text-vm-ink whitespace-nowrap">{v.pack_size} {v.unit}</TableCell>
                      <TableCell className="text-right text-sm text-slate-500">{inr(v.mrp)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{inr(v.public_price)}</TableCell>
                      {data.categories.map((c) => (
                        <TableCell key={c} className="text-right">
                          <Input type="number" value={getVal(v.variant_id, c, v.category_prices[c])} placeholder="—"
                            onChange={(e) => setEdits((s) => ({ ...s, [key(v.variant_id, c)]: e.target.value }))}
                            className="w-24 h-8 text-right ml-auto" data-testid={`cat-input-${v.variant_id}-${c}`} />
                        </TableCell>
                      ))}
                      <TableCell className="text-center"><Button variant="outline" size="sm" onClick={() => setOffersVariant({ id: v.variant_id, product_id: data.product_id, label: `${v.pack_size} ${v.unit}` })} data-testid={`cat-offers-${v.variant_id}`}><Tag className="w-3.5 h-3.5 mr-1" /> Offers</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
      <p className="text-xs text-slate-400 mt-3">Rates are per unit. Leave blank to use the public price. Category-wise <b>offers</b> (10+2, case price, slabs) are managed via the <b>Offers</b> button next to each variant.</p>

      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-lg" data-testid="cat-change-dialog">
          <DialogHeader><DialogTitle className="font-heading">Category Price Change</DialogTitle>
            <DialogDescription>Review affected customers and choose how their negotiated prices should be handled.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-slate-600"><b>{preview?.affected.length}</b> customer(s) currently have a negotiated price that differs from the new category rate. Choose how to handle them:</p>
          <div className="max-h-52 overflow-y-auto border rounded-lg divide-y">
            {preview?.affected.map((a, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-sm" data-testid={`cat-affected-${i}`}>
                <span className="text-vm-ink">{a.name}</span>
                <span className="text-slate-500">{inr(a.old_rate)} → {inr(a.new_rate)} {a.protected && <span className="text-xs text-amber-600 ml-1">Protected</span>}</span>
              </div>
            ))}
          </div>
          <Select value={preview?.mode} onValueChange={(v) => setPreview((p) => ({ ...p, mode: v }))}>
            <SelectTrigger data-testid="cat-change-mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="keep_protected">Update all except protected customers</SelectItem>
              <SelectItem value="reset_all">Update ALL customers to new category price</SelectItem>
              <SelectItem value="keep_all">Keep all customer-specific prices</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
            <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={applyMaster} disabled={busy} data-testid="cat-change-apply">{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Apply Change</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {offersVariant && <OffersDialog variant={offersVariant} onClose={() => setOffersVariant(null)} />}
    </div>
  );
}

function OffersDialog({ variant, onClose }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["offers", variant.id], queryFn: async () => (await api.get(`/admin/pricing/offers/${variant.id}`)).data });
  const [f, setF] = useState({ customer_type: "all", scheme_type: "free_qty", buy_quantity: "", free_quantity: "", special_price: "", min_quantity: "" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const add = useMutation({
    mutationFn: async () => {
      const body = { product_id: variant.product_id, variant_id: variant.id, customer_type: f.customer_type, scheme_type: f.scheme_type };
      if (f.scheme_type === "free_qty") { body.buy_quantity = Number(f.buy_quantity); body.free_quantity = Number(f.free_quantity); body.name = `${f.buy_quantity}+${f.free_quantity}`; }
      else { body.special_price = Number(f.special_price); body.min_quantity = Number(f.min_quantity || 1); body.name = `${f.min_quantity || 1} @ ₹${f.special_price}`; }
      return (await api.post("/admin/pricing/offers", body)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["offers", variant.id] }); setF({ customer_type: "all", scheme_type: "free_qty", buy_quantity: "", free_quantity: "", special_price: "", min_quantity: "" }); toast.success("Offer added"); },
    onError: (e) => toast.error(apiError(e)),
  });
  const del = useMutation({ mutationFn: async (sid) => (await api.delete(`/admin/pricing/offers/${sid}`)).data, onSuccess: () => { qc.invalidateQueries({ queryKey: ["offers", variant.id] }); toast.success("Offer removed"); } });
  const CT = [{ value: "all", label: "Public / All" }, ...CUSTOMER_CATEGORIES];

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl" data-testid="offers-dialog">
        <DialogHeader><DialogTitle className="font-heading">Offers — {variant.label}</DialogTitle>
          <DialogDescription>Multiple offers per category. Best value (most free units) is auto-applied; no stacking.</DialogDescription>
        </DialogHeader>
        <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
          {(data?.items || []).length === 0 ? <p className="text-sm text-slate-400 p-3">No offers yet.</p>
            : data.items.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm" data-testid={`offer-row-${s.id}`}>
                <span><span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 mr-2">{CT.find((c) => c.value === s.customer_type)?.label || s.customer_type}</span>
                  {s.scheme_type === "free_qty" ? `${s.buy_quantity}+${s.free_quantity}` : `${s.scheme_type === "case_price" ? "Case " : ""}${s.min_quantity} @ ₹${s.special_price}`}</span>
                <Button variant="ghost" size="icon" className="text-red-500 h-7 w-7" onClick={() => del.mutate(s.id)} data-testid={`offer-del-${s.id}`}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
        </div>
        <div className="border rounded-lg p-3 space-y-2 bg-vm-bg">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Applies to</Label><Select value={f.customer_type} onValueChange={(v) => set("customer_type", v)}><SelectTrigger data-testid="offer-ct"><SelectValue /></SelectTrigger><SelectContent>{CT.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Type</Label><Select value={f.scheme_type} onValueChange={(v) => set("scheme_type", v)}><SelectTrigger data-testid="offer-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="free_qty">Buy X get Y free</SelectItem><SelectItem value="special_price">Special price @ qty</SelectItem><SelectItem value="case_price">Case price @ qty</SelectItem></SelectContent></Select></div>
          </div>
          {f.scheme_type === "free_qty" ? (
            <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs">Buy</Label><Input type="number" value={f.buy_quantity} onChange={(e) => set("buy_quantity", e.target.value)} data-testid="offer-buy" /></div><div><Label className="text-xs">Free</Label><Input type="number" value={f.free_quantity} onChange={(e) => set("free_quantity", e.target.value)} data-testid="offer-free" /></div></div>
          ) : (
            <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs">Min Qty</Label><Input type="number" value={f.min_quantity} onChange={(e) => set("min_quantity", e.target.value)} data-testid="offer-min" /></div><div><Label className="text-xs">Price ₹/unit</Label><Input type="number" value={f.special_price} onChange={(e) => set("special_price", e.target.value)} data-testid="offer-price" /></div></div>
          )}
          <Button size="sm" className="bg-vm-green hover:bg-vm-greenhover" onClick={() => add.mutate()} disabled={add.isPending} data-testid="offer-add"><Plus className="w-4 h-4 mr-1" /> Add Offer</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const emptyOffer = { rate: "", offerType: "none", buy_quantity: "", free_quantity: "", special_price: "", min_quantity: "" };
function CustomerPricing() {
  const qc = useQueryClient();
  const [customer, setCustomer] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["cust-pricing", customer?.id], queryFn: async () => (await api.get(`/admin/pricing/customer/${customer.id}`)).data, enabled: !!customer });

  const del = useMutation({ mutationFn: async (vid) => (await api.delete(`/admin/pricing/customer/${customer.id}/item/${vid}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cust-pricing", customer.id] }); toast.success("Reset to category price"); }, onError: (e) => toast.error(apiError(e)) });
  const protect = useMutation({ mutationFn: async ({ vid, protectedVal }) => (await api.patch(`/admin/pricing/customer/${customer.id}/item/${vid}/protect`, { protected: protectedVal })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cust-pricing", customer.id] }), onError: (e) => toast.error(apiError(e)) });

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchPicker endpoint="/admin/customers" icon={User} placeholder="Select a customer" value={customer?.name} testid="cust-picker"
          mapItem={(c) => ({ id: c.id, label: `${c.prefix || ""} ${c.name}`, sub: `${c.mobile} · ${CAT_LABEL(c.category)}`, name: c.name, category: c.category })} onPick={setCustomer} />
        {customer && <Button className="bg-vm-green hover:bg-vm-greenhover ml-auto" onClick={() => setAddOpen(true)} data-testid="cust-add-price"><Plus className="w-4 h-4 mr-2" /> Add Product Price</Button>}
      </div>

      {!customer ? <p className="text-slate-400 py-16 text-center">Search and select a customer to manage their negotiated pricing.</p>
        : isLoading ? <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-slate-400" /></div>
          : (
            <>
              <p className="text-sm text-slate-500 mb-3">Category: <b className="text-vm-ink">{CAT_LABEL(data.category)}</b> · Customer-specific prices override category pricing.</p>
              <div className="border border-[#E2E8F0] rounded-lg overflow-x-auto bg-white">
                <Table>
                  <TableHeader><TableRow className="bg-vm-bg"><TableHead>Product</TableHead><TableHead>Pack</TableHead><TableHead className="text-right">Rate</TableHead><TableHead>Offer</TableHead><TableHead>Source</TableHead><TableHead className="text-center">Protected</TableHead><TableHead className="text-right">Reset</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(data.items || []).length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-slate-400">No customer-specific prices. Uses category pricing.</TableCell></TableRow>
                      : data.items.map((it) => (
                        <TableRow key={it.variant_id} data-testid={`cust-price-${it.variant_id}`}>
                          <TableCell className="font-medium text-vm-ink">{it.product_name}</TableCell>
                          <TableCell className="text-sm">{it.pack_size} {it.unit}</TableCell>
                          <TableCell className="text-right font-medium">{inr(it.rate)}</TableCell>
                          <TableCell className="text-sm">{it.offer ? (it.offer.special_price ? `${it.offer.min_quantity || it.offer.buy_quantity || ""} @ ₹${it.offer.special_price}` : `${it.offer.buy_quantity}+${it.offer.free_quantity}`) : "—"}</TableCell>
                          <TableCell><span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">{it.source === "last_confirmed" ? "Last Order" : "Manual"}</span></TableCell>
                          <TableCell className="text-center"><Switch checked={!!it.protected} onCheckedChange={(v) => protect.mutate({ vid: it.variant_id, protectedVal: v })} data-testid={`cust-protect-${it.variant_id}`} /></TableCell>
                          <TableCell className="text-right"><Button variant="ghost" size="icon" className="text-red-500" onClick={() => del.mutate(it.variant_id)} data-testid={`cust-reset-${it.variant_id}`}><Trash2 className="w-4 h-4" /></Button></TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
      {customer && <AddPriceDialog open={addOpen} onOpenChange={setAddOpen} customerId={customer.id} onSaved={() => qc.invalidateQueries({ queryKey: ["cust-pricing", customer.id] })} />}
    </div>
  );
}

function AddPriceDialog({ open, onOpenChange, customerId, onSaved }) {
  const [variant, setVariant] = useState(null);
  const [form, setForm] = useState(emptyOffer);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const reset = () => { setVariant(null); setForm(emptyOffer); };

  const save = useMutation({
    mutationFn: async () => {
      let offer = null;
      if (form.offerType === "free_qty") offer = { scheme_type: "free_qty", buy_quantity: Number(form.buy_quantity), free_quantity: Number(form.free_quantity), name: `${form.buy_quantity}+${form.free_quantity}` };
      if (form.offerType === "special_price") offer = { scheme_type: "special_price", min_quantity: Number(form.min_quantity), special_price: Number(form.special_price), name: `${form.min_quantity} @ ₹${form.special_price}` };
      return (await api.post(`/admin/pricing/customer/${customerId}/item`, { variant_id: variant.variant_id, rate: form.rate === "" ? null : Number(form.rate), offer, source: "manual" })).data;
    },
    onSuccess: () => { onSaved(); onOpenChange(false); reset(); toast.success("Customer price saved"); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-heading">Add Customer Price</DialogTitle>
          <DialogDescription>Set a negotiated rate and optional offer for this customer on a specific product variant.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Product Variant</Label>
            <SearchPicker endpoint="/admin/products" icon={Package} placeholder="Select product" value={variant?.label} testid="add-price-product"
              mapItem={(p) => ({ id: p.id, label: p.name, sub: (p.variants || []).map((v) => v.pack_size).join(", "), product: p })}
              onPick={(it) => { const v = (it.product.variants || [])[0]; setVariant({ variant_id: v.id, label: `${it.product.name} — ${v.pack_size} ${v.unit || ""}`, variants: it.product.variants, name: it.product.name }); }} />
            {variant?.variants?.length > 1 && (
              <Select onValueChange={(vid) => { const v = variant.variants.find((x) => x.id === vid); setVariant((s) => ({ ...s, variant_id: vid, label: `${s.name} — ${v.pack_size} ${v.unit || ""}` })); }}>
                <SelectTrigger className="mt-2" data-testid="add-price-variant"><SelectValue placeholder="Choose pack size" /></SelectTrigger>
                <SelectContent>{variant.variants.map((v) => <SelectItem key={v.id} value={v.id}>{v.pack_size} {v.unit}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
          <div><Label>Special Rate (₹)</Label><Input type="number" value={form.rate} onChange={(e) => set("rate", e.target.value)} data-testid="add-price-rate" /></div>
          <div>
            <Label>Offer</Label>
            <Select value={form.offerType} onValueChange={(v) => set("offerType", v)}><SelectTrigger data-testid="add-price-offer-type"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">No special offer</SelectItem><SelectItem value="free_qty">Buy X get Y free</SelectItem><SelectItem value="special_price">Special price @ qty</SelectItem></SelectContent></Select>
          </div>
          {form.offerType === "free_qty" && <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs">Buy Qty</Label><Input type="number" value={form.buy_quantity} onChange={(e) => set("buy_quantity", e.target.value)} data-testid="add-price-buy" /></div><div><Label className="text-xs">Free Qty</Label><Input type="number" value={form.free_quantity} onChange={(e) => set("free_quantity", e.target.value)} data-testid="add-price-free" /></div></div>}
          {form.offerType === "special_price" && <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs">Min Qty</Label><Input type="number" value={form.min_quantity} onChange={(e) => set("min_quantity", e.target.value)} /></div><div><Label className="text-xs">Special ₹</Label><Input type="number" value={form.special_price} onChange={(e) => set("special_price", e.target.value)} /></div></div>}
        </div>
        <DialogFooter><Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => save.mutate()} disabled={save.isPending || !variant} data-testid="add-price-save">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPricingManager() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-6"><IndianRupee className="w-6 h-6 text-vm-green" /><div><h1 className="font-heading text-2xl font-bold text-vm-ink">Pricing Manager</h1><p className="text-slate-500 text-sm">Category & customer-specific pricing</p></div></div>
      <Tabs defaultValue="category">
        <TabsList><TabsTrigger value="category" data-testid="tab-category-pricing"><Package className="w-4 h-4 mr-1" /> Category Pricing</TabsTrigger><TabsTrigger value="customer" data-testid="tab-customer-pricing"><User className="w-4 h-4 mr-1" /> Customer Pricing</TabsTrigger></TabsList>
        <TabsContent value="category" className="mt-5"><CategoryPricing /></TabsContent>
        <TabsContent value="customer" className="mt-5"><CustomerPricing /></TabsContent>
      </Tabs>
    </div>
  );
}
