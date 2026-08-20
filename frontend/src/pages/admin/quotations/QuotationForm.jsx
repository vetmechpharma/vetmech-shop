import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Package, PencilLine, Check, ChevronsUpDown, Save } from "lucide-react";
import { inr } from "./quotationConstants";

const emptyItem = () => ({ product_id: null, variant_id: null, name: "", packing: "", unit: "", qty: 1, mrp: 0, rate: 0, discount: 0, discount_type: "percent", gst: 0, save_to_catalog: false });

function calcLine(it) {
  const gross = (Number(it.qty) || 0) * (Number(it.rate) || 0);
  const dAmt = it.discount_type === "percent" ? gross * (Number(it.discount) || 0) / 100 : (Number(it.discount) || 0);
  const taxable = Math.max(gross - dAmt, 0);
  const gst = taxable * (Number(it.gst) || 0) / 100;
  return { gross, dAmt, taxable, gst, total: taxable + gst };
}

function ProductPicker({ products, onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" className="justify-between w-full sm:w-72" data-testid="qtn-product-picker">
          <span className="flex items-center gap-2 text-slate-600"><Package className="w-4 h-4" /> Add catalog product</span>
          <ChevronsUpDown className="w-4 h-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-80" align="start">
        <Command>
          <CommandInput placeholder="Search products..." data-testid="qtn-product-search" />
          <CommandList>
            <CommandEmpty>No products.</CommandEmpty>
            <CommandGroup>
              {(products || []).flatMap((p) => (p.variants || [{}]).map((v) => (
                <CommandItem key={`${p.id}-${v.id || "0"}`} value={`${p.name} ${v.pack_size || ""} ${v.sku || ""}`}
                  onSelect={() => { onPick(p, v); setOpen(false); }}>
                  <div><div className="text-sm text-vm-ink">{p.name}</div><div className="text-xs text-slate-500">{v.pack_size} {v.unit} · ₹{v.selling_price ?? v.mrp}</div></div>
                </CommandItem>
              )))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function QuotationForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const isEdit = !!id;

  const [customerId, setCustomerId] = useState("");
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [validity, setValidity] = useState(15);
  const [items, setItems] = useState([emptyItem()]);
  const [terms, setTerms] = useState([]);
  const [notes, setNotes] = useState("");
  const [custOpen, setCustOpen] = useState(false);

  const { data: custData } = useQuery({ queryKey: ["qtn-crm"], queryFn: async () => (await api.get("/crm/customers", { params: { limit: 500 } })).data });
  const { data: prodData } = useQuery({ queryKey: ["qtn-products"], queryFn: async () => (await api.get("/admin/products", { params: { limit: 500 } })).data });
  const { data: qcfg } = useQuery({ queryKey: ["qtn-settings"], queryFn: async () => (await api.get("/admin/settings/quotation")).data });
  const { data: existing } = useQuery({ queryKey: ["qtn", id], queryFn: async () => (await api.get(`/admin/quotations/${id}`)).data, enabled: isEdit });

  const customers = custData?.items || [];
  const products = prodData?.items || [];

  useEffect(() => {
    if (!isEdit && qcfg?.terms && terms.length === 0) setTerms(qcfg.terms);
  }, [qcfg, isEdit]); // eslint-disable-line

  useEffect(() => {
    if (existing) {
      setCustomerId(existing.customer_id || "");
      setQuoteDate(existing.quote_date);
      setValidity(existing.validity_days);
      setTerms(existing.terms || []);
      setNotes(existing.notes || "");
      setItems((existing.items || []).map((it) => ({ ...emptyItem(), ...it, discount: it.discount ?? it.discount_amount ?? 0, save_to_catalog: false })));
    }
  }, [existing]);

  const setItem = (i, k, v) => setItems((arr) => arr.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const addManual = () => setItems((a) => [...a, emptyItem()]);
  const removeItem = (i) => setItems((a) => a.filter((_, idx) => idx !== i));
  const pickProduct = (p, v) => setItems((a) => [...a, { ...emptyItem(), product_id: p.id, variant_id: v.id || null, name: p.name, packing: v.pack_size || "", unit: v.unit || "", mrp: v.mrp || 0, rate: v.selling_price ?? v.mrp ?? 0, gst: v.gst_percent || 0, qty: 1 }]);

  const totals = useMemo(() => {
    let total = 0, disc = 0, gst = 0, grand = 0;
    items.forEach((it) => { const c = calcLine(it); total += c.gross; disc += c.dAmt; gst += c.gst; grand += c.total; });
    return { total, disc, gst, grand };
  }, [items]);

  const save = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error("Please select a customer");
      const valid = items.filter((it) => it.name && Number(it.qty) > 0);
      if (valid.length === 0) throw new Error("Add at least one item");
      for (const it of valid.filter((x) => x.save_to_catalog && !x.product_id)) {
        try {
          await api.post("/admin/products", { name: it.name, active: true, variants: [{ pack_size: it.packing, unit: it.unit, mrp: Number(it.mrp) || 0, selling_price: Number(it.rate) || 0, gst_percent: Number(it.gst) || 0, stock_status: "in_stock" }] });
        } catch (e) { toast.warning(`Could not save "${it.name}" to catalog`); }
      }
      const payload = {
        customer_id: customerId, quote_date: quoteDate, validity_days: Number(validity), notes, terms,
        items: valid.map((it) => ({ product_id: it.product_id, variant_id: it.variant_id, name: it.name, packing: it.packing, unit: it.unit, qty: Number(it.qty), mrp: Number(it.mrp) || 0, rate: Number(it.rate) || 0, discount: Number(it.discount) || 0, discount_type: it.discount_type, gst: Number(it.gst) || 0 })),
      };
      return isEdit ? (await api.put(`/admin/quotations/${id}`, payload)).data : (await api.post("/admin/quotations", payload)).data;
    },
    onSuccess: (r) => { toast.success(isEdit ? "Quotation updated" : "Quotation created"); nav(`/admin/quotations/${r.id}`); },
    onError: (e) => toast.error(e.message || apiError(e)),
  });

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold text-vm-ink">{isEdit ? "Edit Quotation" : "New Quotation"}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => nav("/admin/quotations/list")}>Cancel</Button>
          <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => save.mutate()} disabled={save.isPending} data-testid="qtn-save-btn">{save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save</Button>
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 mb-5 grid sm:grid-cols-3 gap-4">
        <div className="sm:col-span-1">
          <Label>Customer</Label>
          <Popover open={custOpen} onOpenChange={setCustOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-full justify-between mt-1 font-normal" data-testid="qtn-customer-picker">
                <span className="truncate">{customerId ? (customers.find((c) => c.id === customerId)?.company_name || customers.find((c) => c.id === customerId)?.contact_name) : "Select customer"}</span>
                <ChevronsUpDown className="w-4 h-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-80" align="start">
              <Command>
                <CommandInput placeholder="Search customer..." data-testid="qtn-customer-search" />
                <CommandList><CommandEmpty>No customer.</CommandEmpty><CommandGroup>
                  {customers.map((c) => (
                    <CommandItem key={c.id} value={`${c.company_name} ${c.contact_name} ${c.phone}`} onSelect={() => { setCustomerId(c.id); setCustOpen(false); }}>
                      <Check className={`w-4 h-4 mr-2 ${customerId === c.id ? "opacity-100" : "opacity-0"}`} />
                      <div><div className="text-sm text-vm-ink">{c.company_name || c.contact_name}</div><div className="text-xs text-slate-500">{c.contact_name} · {c.phone}</div></div>
                    </CommandItem>
                  ))}
                </CommandGroup></CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div><Label>Quote Date</Label><Input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} className="mt-1" data-testid="qtn-date" /></div>
        <div><Label>Validity (days)</Label><Input type="number" value={validity} onChange={(e) => setValidity(e.target.value)} className="mt-1" data-testid="qtn-validity" /></div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-heading font-semibold text-vm-ink">Line Items</h3>
          <div className="flex gap-2">
            <ProductPicker products={products} onPick={pickProduct} />
            <Button variant="outline" size="sm" onClick={addManual} data-testid="qtn-add-manual"><PencilLine className="w-4 h-4 mr-2" /> Add manual item</Button>
          </div>
        </div>

        <div className="space-y-3">
          {items.map((it, i) => {
            const c = calcLine(it);
            return (
              <div key={i} className="border border-[#EEF2F1] rounded-lg p-3 bg-[#FAFCFB]" data-testid={`qtn-item-${i}`}>
                <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
                  <div className="col-span-2 sm:col-span-3"><Label className="text-xs">Product {!it.product_id && <span className="text-vm-accent">(manual)</span>}</Label><Input value={it.name} onChange={(e) => setItem(i, "name", e.target.value)} disabled={!!it.product_id} data-testid={`qtn-item-name-${i}`} /></div>
                  <div className="sm:col-span-1"><Label className="text-xs">Pack</Label><Input value={it.packing} onChange={(e) => setItem(i, "packing", e.target.value)} disabled={!!it.product_id} /></div>
                  <div className="sm:col-span-1"><Label className="text-xs">Unit</Label><Input value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)} disabled={!!it.product_id} /></div>
                  <div className="sm:col-span-1"><Label className="text-xs">Qty</Label><Input type="number" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} data-testid={`qtn-item-qty-${i}`} /></div>
                  <div className="sm:col-span-1"><Label className="text-xs">MRP</Label><Input type="number" value={it.mrp} onChange={(e) => setItem(i, "mrp", e.target.value)} /></div>
                  <div className="sm:col-span-1"><Label className="text-xs">Rate</Label><Input type="number" value={it.rate} onChange={(e) => setItem(i, "rate", e.target.value)} data-testid={`qtn-item-rate-${i}`} /></div>
                  <div className="sm:col-span-2"><Label className="text-xs">Discount</Label>
                    <div className="flex gap-1">
                      <Input type="number" value={it.discount} onChange={(e) => setItem(i, "discount", e.target.value)} />
                      <Select value={it.discount_type} onValueChange={(v) => setItem(i, "discount_type", v)}><SelectTrigger className="w-16 px-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percent">%</SelectItem><SelectItem value="amount">₹</SelectItem></SelectContent></Select>
                    </div>
                  </div>
                  <div className="sm:col-span-1"><Label className="text-xs">GST%</Label><Input type="number" value={it.gst} onChange={(e) => setItem(i, "gst", e.target.value)} /></div>
                  <div className="col-span-2 sm:col-span-12 flex items-center justify-between pt-1">
                    <div className="flex items-center gap-4">
                      {!it.product_id && (
                        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                          <input type="checkbox" checked={!!it.save_to_catalog} onChange={(e) => setItem(i, "save_to_catalog", e.target.checked)} data-testid={`qtn-save-catalog-${i}`} /> Save to catalog
                        </label>
                      )}
                      <span className="text-xs text-slate-500">Line total: <b className="text-vm-ink">{inr(c.total)}</b></span>
                    </div>
                    <Button variant="ghost" size="icon" className="text-red-500 h-8 w-8" onClick={() => removeItem(i)} data-testid={`qtn-item-remove-${i}`}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end mt-4">
          <div className="w-full sm:w-72 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{inr(totals.total)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>- {inr(totals.disc)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">GST</span><span>{inr(totals.gst)}</span></div>
            <div className="flex justify-between font-bold text-vm-ink border-t pt-1 mt-1"><span>Grand Total</span><span className="text-vm-green">{inr(totals.grand)}</span></div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-semibold text-vm-ink">Terms & Conditions</h3>
          <Button variant="outline" size="sm" onClick={() => setTerms((t) => [...t, ""])}><Plus className="w-4 h-4 mr-1" /> Add term</Button>
        </div>
        <div className="space-y-2">
          {terms.map((t, i) => (
            <div key={i} className="flex gap-2"><Input value={t} onChange={(e) => setTerms((arr) => arr.map((x, idx) => idx === i ? e.target.value : x))} data-testid={`qtn-term-${i}`} /><Button variant="ghost" size="icon" className="text-red-500" onClick={() => setTerms((arr) => arr.filter((_, idx) => idx !== i))}><Trash2 className="w-4 h-4" /></Button></div>
          ))}
          {terms.length === 0 && <p className="text-sm text-slate-400">No terms added.</p>}
        </div>
        <div className="mt-4"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" placeholder="Optional internal / customer notes" data-testid="qtn-notes" /></div>
      </div>
    </div>
  );
}
