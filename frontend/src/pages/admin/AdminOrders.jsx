import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Eye, Download, FileText, Plus, Trash2, X } from "lucide-react";
import { ORDER_STATUSES, statusMeta, CUSTOMER_CATEGORIES, INDIAN_STATES } from "@/lib/constants";
import { exportRows } from "@/lib/exportUtils";
import DispatchSection from "@/components/admin/DispatchSection";

export default function AdminOrders() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const delOrder = useMutation({ mutationFn: async (id) => (await api.delete(`/admin/orders/${id}`)).data, onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-orders"] }); toast.success("Order deleted"); }, onError: (e) => toast.error(apiError(e)) });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders", status, q],
    queryFn: async () => (await api.get("/admin/orders", { params: { status: status !== "all" ? status : undefined, q: q || undefined, limit: 100 } })).data,
  });

  const doExport = (type) => {
    const rows = (data?.items || []).map((o) => ({
      OrderNumber: o.order_number, Date: new Date(o.created_at).toLocaleString(), Customer: o.customer_name,
      Company: o.company_name, Mobile: o.customer_mobile, Category: o.customer_category,
      Products: o.items.length, OrderedQty: o.total_qty, FreeQty: o.total_free, Status: statusMeta(o.status).label,
      Transport: o.dispatch?.transport || "", Freight: o.dispatch ? (o.dispatch.freight === "paid" ? "Paid" : "To Pay") : "",
      InvoiceNo: o.dispatch?.invoice_number || "", InvoiceValue: o.dispatch?.invoice_value || "",
    }));
    exportRows(rows, `vetmech-orders`, type);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div><h1 className="font-heading text-2xl font-bold text-vm-ink">Orders</h1><p className="text-slate-500 text-sm">Manage and track all orders</p></div>
        <div className="flex gap-2">
          <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => setCreateOpen(true)} data-testid="admin-create-order"><Plus className="w-4 h-4 mr-1" /> Create Order</Button>
          <Button variant="outline" size="sm" onClick={() => doExport("csv")} data-testid="export-csv"><Download className="w-4 h-4 mr-1" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => doExport("xlsx")} data-testid="export-xlsx"><Download className="w-4 h-4 mr-1" /> Excel</Button>
          <Button variant="outline" size="sm" onClick={() => doExport("pdf")} data-testid="export-pdf"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <Input placeholder="Search order #, name, mobile..." value={q} onChange={(e) => setQ(e.target.value)} className="w-64" data-testid="order-search" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48" data-testid="order-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Statuses</SelectItem>{ORDER_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="border border-[#E2E8F0] rounded-lg overflow-x-auto bg-white">
        <Table>
          <TableHeader><TableRow className="bg-vm-bg"><TableHead>Order #</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead className="text-center">Qty</TableHead><TableHead>Status</TableHead><TableHead>Transport</TableHead><TableHead>Freight</TableHead><TableHead>Invoice #</TableHead><TableHead className="text-right">View</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={9} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></TableCell></TableRow>
              : (data?.items || []).length === 0 ? <TableRow><TableCell colSpan={9} className="text-center py-10 text-slate-400">No orders found.</TableCell></TableRow>
              : data.items.map((o) => (
                <TableRow key={o.id} data-testid={`order-row-${o.order_number}`}>
                  <TableCell className="font-medium text-vm-green">{o.order_number}</TableCell>
                  <TableCell><span className="text-vm-ink">{o.customer_name}</span><br /><span className="text-xs text-slate-400">{o.customer_mobile}</span></TableCell>
                  <TableCell className="text-sm text-slate-500">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-center">{o.total_qty}{o.total_free ? <span className="text-vm-accent text-xs"> +{o.total_free}</span> : ""}</TableCell>
                  <TableCell><span className={`text-xs font-semibold px-2.5 py-1 rounded ${statusMeta(o.status).color}`}>{statusMeta(o.status).label}</span></TableCell>
                  <TableCell className="text-sm text-slate-600">{o.dispatch?.transport || <span className="text-slate-300">—</span>}</TableCell>
                  <TableCell className="text-sm">{o.dispatch ? <span className={`text-xs font-semibold px-2 py-0.5 rounded ${o.dispatch.freight === "paid" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{o.dispatch.freight === "paid" ? "Paid" : "To Pay"}</span> : <span className="text-slate-300">—</span>}</TableCell>
                  <TableCell className="text-sm text-slate-600">{o.dispatch?.invoice_number || <span className="text-slate-300">—</span>}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" onClick={() => setDetailId(o.id)} data-testid={`view-order-${o.order_number}`}><Eye className="w-4 h-4" /></Button>
                    <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-red-500" data-testid={`delete-order-${o.order_number}`}><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete order {o.order_number}?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600" onClick={() => delOrder.mutate(o.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {detailId && <OrderDetail key={detailId} id={detailId} onClose={() => setDetailId(null)} onChange={() => qc.invalidateQueries({ queryKey: ["admin-orders"] })} />}
      <CreateOrderDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => qc.invalidateQueries({ queryKey: ["admin-orders"] })} />
    </div>
  );
}

function CreateOrderDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState({ category: "doctor", items: [], line1: "", pincode: "", state: "", district: "" });
  const [saving, setSaving] = useState(false);
  const { data: products } = useQuery({ queryKey: ["ao-products"], queryFn: async () => (await api.get("/admin/products", { params: { limit: 200 } })).data, enabled: open });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const addRow = () => set("items", [...form.items, { product_id: "", variant_id: "", qty: 1 }]);
  const setRow = (i, k, v) => setForm((f) => ({ ...f, items: f.items.map((r, ri) => ri === i ? { ...r, [k]: v } : r) }));
  const variantsOf = (pid) => (products?.items || []).find((p) => p.id === pid)?.variants || [];

  const submit = async () => {
    const items = form.items.filter((r) => r.variant_id && r.qty > 0).map((r) => ({ variant_id: r.variant_id, qty: Number(r.qty) }));
    if (!form.name || !form.mobile) { toast.error("Customer name and mobile required"); return; }
    if (items.length === 0) { toast.error("Add at least one product"); return; }
    setSaving(true);
    try {
      await api.post("/admin/orders", {
        name: form.name, mobile: form.mobile, company_name: form.company_name, category: form.category,
        address: { line1: form.line1, pincode: form.pincode, state: form.state, district: form.district },
        items, status: form.status || "new",
      });
      toast.success("Order created");
      onCreated(); onOpenChange(false);
      setForm({ category: "doctor", items: [], line1: "", pincode: "", state: "", district: "" });
    } catch (e) { toast.error(apiError(e)); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="create-order-dialog">
        <DialogHeader><DialogTitle className="font-heading">Create Order (Admin)</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Customer Name</Label><Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} data-testid="co-name" /></div>
          <div><Label>Mobile</Label><Input value={form.mobile || ""} onChange={(e) => set("mobile", e.target.value)} data-testid="co-mobile" /></div>
          <div><Label>Company (optional)</Label><Input value={form.company_name || ""} onChange={(e) => set("company_name", e.target.value)} /></div>
          <div><Label>Category</Label><Select value={form.category} onValueChange={(v) => set("category", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CUSTOMER_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="sm:col-span-2"><Label>Address Line</Label><Input value={form.line1} onChange={(e) => set("line1", e.target.value)} /></div>
          <div><Label>District</Label><Input value={form.district} onChange={(e) => set("district", e.target.value)} /></div>
          <div><Label>Pincode</Label><Input value={form.pincode} onChange={(e) => set("pincode", e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>State</Label><Select value={form.state} onValueChange={(v) => set("state", v)}><SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger><SelectContent className="max-h-52">{INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="mt-2">
          <Label>Products</Label>
          <div className="space-y-2 mt-1">
            {form.items.map((r, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Select value={r.product_id} onValueChange={(v) => { setRow(i, "product_id", v); setRow(i, "variant_id", ""); }}><SelectTrigger className="flex-1" data-testid={`co-product-${i}`}><SelectValue placeholder="Product" /></SelectTrigger><SelectContent>{(products?.items || []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
                <Select value={r.variant_id} onValueChange={(v) => setRow(i, "variant_id", v)}><SelectTrigger className="w-32" data-testid={`co-variant-${i}`}><SelectValue placeholder="Pack" /></SelectTrigger><SelectContent>{variantsOf(r.product_id).map((v) => <SelectItem key={v.id} value={v.id}>{v.pack_size} {v.unit}</SelectItem>)}</SelectContent></Select>
                <Input type="number" className="w-20" value={r.qty} onChange={(e) => setRow(i, "qty", e.target.value)} data-testid={`co-qty-${i}`} />
                <Button variant="ghost" size="icon" onClick={() => set("items", form.items.filter((_, ri) => ri !== i))}><X className="w-4 h-4" /></Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="mt-2" onClick={addRow} data-testid="co-add-item"><Plus className="w-4 h-4 mr-1" /> Add Product</Button>
        </div>
        <div className="flex justify-end gap-2 mt-3"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button className="bg-vm-green hover:bg-vm-greenhover" onClick={submit} disabled={saving} data-testid="co-submit">{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create Order</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function OrderDetail({ id, onClose, onChange }) {
  const qc = useQueryClient();
  const { data: order } = useQuery({ queryKey: ["admin-order", id], queryFn: async () => (await api.get(`/admin/orders/${id}`)).data, enabled: !!id });
  const [notes, setNotes] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [rows, setRows] = useState([]);
  const [updatePricing, setUpdatePricing] = useState(false);
  const [notifyOos, setNotifyOos] = useState(true);
  const [notifyRestock, setNotifyRestock] = useState(true);
  const [prevPricing, setPrevPricing] = useState({});

  const setStatus = useMutation({
    mutationFn: async (status) => (await api.patch(`/admin/orders/${id}/status`, { status })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-order", id] }); onChange(); toast.success("Status updated — WhatsApp notification sent"); },
    onError: (e) => toast.error(apiError(e)),
  });
  const saveNotes = useMutation({
    mutationFn: async () => (await api.put(`/admin/orders/${id}`, { internal_notes: notes })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-order", id] }); toast.success("Notes saved"); },
  });
  const savePricing = useMutation({
    mutationFn: async () => {
      const items = rows.map((r) => ({
        variant_id: r.variant_id, qty: Number(r.qty),
        rate: r.rate === "" ? null : Number(r.rate),
        offer: (r.buy && r.free) ? { buy_quantity: Number(r.buy), free_quantity: Number(r.free) } : null,
        out_of_stock: !!r.oos,
      }));
      const anyOos = rows.some((r) => r.oos);
      const anyRestock = rows.some((r) => r.origOos && !r.oos);
      return (await api.put(`/admin/orders/${id}`, { items, update_customer_pricing: updatePricing, notify_out_of_stock: anyOos && notifyOos, notify_restock: anyRestock && notifyRestock })).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-order", id] }); onChange(); setEditMode(false); toast.success(updatePricing ? "Order & customer pricing updated" : "Order updated"); },
    onError: (e) => toast.error(apiError(e)),
  });

  const startEdit = async () => {
    setRows((order.items || []).map((l) => {
      const m = /^(\d+)\+(\d+)$/.exec(l.scheme_label || "");
      return { variant_id: l.variant_id, name: l.product_name, pack: `${l.pack_size} ${l.unit}`, qty: l.qty, rate: l.unit_price ?? "", buy: m ? m[1] : "", free: m ? m[2] : "", oos: l.out_of_stock || l.stock_status === "out_of_stock", origOos: l.out_of_stock || l.stock_status === "out_of_stock" };
    }));
    setUpdatePricing(false);
    setNotifyOos(true);
    setEditMode(true);
    try {
      const pp = (await api.get(`/admin/orders/${id}/prev-pricing`)).data;
      setPrevPricing(pp.prices || {});
    } catch { setPrevPricing({}); }
  };
  const setRow = (i, k, v) => setRows((rs) => rs.map((r, ri) => ri === i ? { ...r, [k]: v } : r));

  return (
    <Sheet open={!!id} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="order-detail">
        {!order ? <div className="py-20 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div> : (
          <>
            <SheetHeader><SheetTitle className="font-heading text-vm-green">{order.order_number}</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-5 text-sm">
              <div>
                <Label>Order Status</Label>
                <Select value={order.status} onValueChange={(v) => setStatus.mutate(v)}>
                  <SelectTrigger className="mt-1" data-testid="change-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{ORDER_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="bg-vm-bg rounded-lg p-3">
                <p className="font-medium text-vm-ink">{order.customer_name} {order.company_name && `· ${order.company_name}`}</p>
                <p className="text-slate-500">{order.customer_mobile} · {CUSTOMER_CATEGORIES.find((c) => c.value === order.customer_category)?.label}</p>
                <p className="text-slate-500 mt-1">{order.address?.line1}, {order.address?.district}, {order.address?.state} - {order.address?.pincode}</p>
                {order.cash_discount && <p className="mt-2 inline-block text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded px-2 py-1" data-testid="cash-discount-flag">CASH DISCOUNT BILL (4%) REQUESTED</p>}
                {order.origin && (
                  <div className="mt-3 text-[11px] text-slate-400 border-t pt-2" data-testid="order-origin">
                    <p className="font-semibold text-slate-500">Order Origin (authenticity)</p>
                    <p>{order.origin.device} · {order.origin.browser} · {order.origin.os}</p>
                    <p>IP {order.origin.ip || "—"}{order.origin.location ? ` · ${order.origin.location}` : ""}</p>
                    {(order.origin.timezone || order.origin.screen) && <p>{order.origin.timezone}{order.origin.screen ? ` · ${order.origin.screen}` : ""}</p>}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>Products & Pricing</Label>
                  {!editMode && <Button size="sm" variant="outline" onClick={startEdit} data-testid="order-edit-pricing">Edit Pricing</Button>}
                </div>
                {!editMode ? (
                  <>
                    <div className="border rounded-lg mt-1 divide-y">
                      {order.items.map((l) => (
                        <div key={l.variant_id} className="p-3 flex justify-between">
                          <div><p className="font-medium text-vm-ink">{l.product_name} {(l.out_of_stock || l.stock_status === "out_of_stock") && <span className="ml-1 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5" data-testid={`oos-badge-${l.variant_id}`}>OUT OF STOCK</span>}</p><p className="text-xs text-slate-400">{l.pack_size} {l.unit} · ₹{l.unit_price} {l.price_source && <span className="text-vm-accent">({l.price_source})</span>}</p></div>
                          <div className="text-right"><p className="text-vm-ink">Qty {l.qty}</p>{l.free_qty > 0 && <p className="text-xs text-vm-accent">+{l.free_qty} free ({l.scheme_label})</p>}<p className="text-xs text-slate-400">Dispatch {l.dispatch_qty}</p></div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-4 mt-2 text-xs"><span>Ordered <strong>{order.total_qty}</strong></span><span>Free <strong className="text-vm-accent">{order.total_free}</strong></span><span>Dispatch <strong className="text-vm-green">{order.total_dispatch}</strong></span></div>
                  </>
                ) : (
                  <div className="border rounded-lg mt-1 divide-y">
                    {rows.map((r, i) => (
                      <div key={r.variant_id} className={`p-3 space-y-2 ${r.oos ? "bg-red-50" : ""}`} data-testid={`order-edit-row-${i}`}>
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-vm-ink">{r.name} <span className="text-xs text-slate-400">{r.pack}</span></p>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer shrink-0" data-testid={`order-oos-label-${i}`}>
                            <input type="checkbox" checked={!!r.oos} onChange={(e) => setRow(i, "oos", e.target.checked)} data-testid={`order-oos-${i}`} />
                            <span className={r.oos ? "text-red-600 font-medium" : "text-slate-500"}>Out of stock</span>
                          </label>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          <div><Label className="text-[10px]">Qty</Label><Input type="number" value={r.qty} onChange={(e) => setRow(i, "qty", e.target.value)} className="h-8" data-testid={`order-qty-${i}`} /></div>
                          <div><Label className="text-[10px]">Rate ₹</Label><Input type="number" value={r.rate} onChange={(e) => setRow(i, "rate", e.target.value)} className="h-8" data-testid={`order-rate-${i}`} /></div>
                          <div><Label className="text-[10px]">Buy</Label><Input type="number" value={r.buy} onChange={(e) => setRow(i, "buy", e.target.value)} className="h-8" data-testid={`order-buy-${i}`} /></div>
                          <div><Label className="text-[10px]">Free</Label><Input type="number" value={r.free} onChange={(e) => setRow(i, "free", e.target.value)} className="h-8" data-testid={`order-free-${i}`} /></div>
                        </div>
                        {prevPricing[r.variant_id] && <p className="text-[11px] text-vm-accent bg-vm-accent/5 border border-vm-accent/20 rounded px-2 py-1 mt-1" data-testid={`prev-pricing-${i}`}>Previously bought @ ₹{prevPricing[r.variant_id].rate}{prevPricing[r.variant_id].qty ? ` for qty ${prevPricing[r.variant_id].qty}` : ""}{prevPricing[r.variant_id].offer && prevPricing[r.variant_id].offer.free_quantity ? ` · offer ${prevPricing[r.variant_id].offer.buy_quantity}+${prevPricing[r.variant_id].offer.free_quantity} free` : ""}{prevPricing[r.variant_id].qty ? ` (applies only at qty ${prevPricing[r.variant_id].qty})` : ""}</p>}
                      </div>
                    ))}
                    <div className="p-3 space-y-3">
                      {rows.some((r) => r.oos) && (
                        <label className="flex items-center gap-2 text-sm cursor-pointer text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2" data-testid="order-notify-oos-wrap">
                          <input type="checkbox" checked={notifyOos} onChange={(e) => setNotifyOos(e.target.checked)} data-testid="order-notify-oos" />
                          Send ONE WhatsApp message listing all {rows.filter((r) => r.oos).length} out-of-stock item(s) to the customer
                        </label>
                      )}
                      {rows.some((r) => r.origOos && !r.oos) && (
                        <label className="flex items-center gap-2 text-sm cursor-pointer text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2" data-testid="order-notify-restock-wrap">
                          <input type="checkbox" checked={notifyRestock} onChange={(e) => setNotifyRestock(e.target.checked)} data-testid="order-notify-restock" />
                          Send a "back in stock" WhatsApp for {rows.filter((r) => r.origOos && !r.oos).length} item(s) now available
                        </label>
                      )}
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={updatePricing} onChange={(e) => setUpdatePricing(e.target.checked)} data-testid="order-update-pricing" />
                        Update this customer's negotiated pricing from these values
                      </label>
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-vm-green hover:bg-vm-greenhover" onClick={() => savePricing.mutate()} disabled={savePricing.isPending} data-testid="order-save-pricing">{savePricing.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save & Confirm</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <DispatchSection key={order.id + (order.dispatch?.cases ? "-d" : "-p")} order={order} onDone={() => { qc.invalidateQueries({ queryKey: ["admin-order", id] }); onChange(); }} />

              <div>
                <Label>Internal Notes</Label>
                <Textarea className="mt-1" defaultValue={order.internal_notes} onChange={(e) => setNotes(e.target.value)} data-testid="internal-notes" />
                <Button size="sm" variant="outline" className="mt-2" onClick={() => saveNotes.mutate()}>Save Notes</Button>
              </div>

              <div>
                <Label>Activity Log</Label>
                <div className="mt-1 space-y-2 border-l-2 border-vm-accent/30 pl-3">
                  {(order.activity || []).map((a) => (
                    <div key={a.id} className="text-xs"><span className="text-slate-400">{new Date(a.at).toLocaleString()}</span><br /><span className="text-vm-ink">{a.text}</span> <span className="text-slate-400">— {a.actor}</span></div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
