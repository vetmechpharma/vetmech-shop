import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { CUSTOMER_CATEGORIES } from "@/lib/constants";

export default function AdminSchemes() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const { data: schemes, isLoading } = useQuery({ queryKey: ["admin-schemes"], queryFn: async () => (await api.get("/admin/schemes")).data });
  const { data: products } = useQuery({ queryKey: ["admin-products-all"], queryFn: async () => (await api.get("/admin/products", { params: { limit: 200 } })).data });

  const save = useMutation({
    mutationFn: async (p) => editing ? (await api.put(`/admin/schemes/${editing.id}`, p)).data : (await api.post("/admin/schemes", p)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-schemes"] }); setOpen(false); toast.success("Scheme saved"); },
    onError: (e) => toast.error(apiError(e)),
  });
  const del = useMutation({ mutationFn: async (id) => (await api.delete(`/admin/schemes/${id}`)).data, onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-schemes"] }); toast.success("Deleted"); } });

  const openNew = () => { setEditing(null); setForm({ scheme_type: "free_qty", customer_type: "all", active: true }); setOpen(true); };
  const openEdit = (s) => { setEditing(s); setForm({ ...s }); setOpen(true); };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const productName = (id) => products?.items?.find((p) => p.id === id)?.name || "—";
  const selectedProduct = products?.items?.find((p) => p.id === form.product_id);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="font-heading text-2xl font-bold text-vm-ink">Schemes & Offers</h1><p className="text-slate-500 text-sm">Auto-applied quantity schemes & special prices</p></div>
        <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={openNew} data-testid="add-scheme"><Plus className="w-4 h-4 mr-2" /> Add Scheme</Button>
      </div>

      <div className="border border-[#E2E8F0] rounded-lg overflow-x-auto bg-white">
        <Table>
          <TableHeader><TableRow className="bg-vm-bg"><TableHead>Name</TableHead><TableHead>Product</TableHead><TableHead>Type</TableHead><TableHead>Rule</TableHead><TableHead>Active</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></TableCell></TableRow>
              : (schemes || []).map((s) => (
                <TableRow key={s.id} data-testid={`scheme-row-${s.id}`}>
                  <TableCell className="font-medium text-vm-ink">{s.name}</TableCell>
                  <TableCell className="text-sm">{productName(s.product_id)}</TableCell>
                  <TableCell className="text-sm">{s.scheme_type === "special_price" ? "Special Price" : "Free Qty"}</TableCell>
                  <TableCell className="text-sm text-vm-accent font-medium">{s.scheme_type === "special_price" ? `${s.min_quantity} @ ₹${s.special_price}` : `${s.buy_quantity}+${s.free_quantity}`}</TableCell>
                  <TableCell>{s.active ? <span className="text-green-600 text-xs">Yes</span> : <span className="text-slate-400 text-xs">No</span>}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
                    <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-red-500"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete scheme?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600" onClick={() => del.mutate(s.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="scheme-dialog">
          <DialogHeader><DialogTitle className="font-heading">{editing ? "Edit" : "Add"} Scheme</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Scheme Name</Label><Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} data-testid="sf-name" /></div>
            <div><Label>Scheme Type</Label>
              <Select value={form.scheme_type} onValueChange={(v) => set("scheme_type", v)}><SelectTrigger data-testid="sf-type"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="free_qty">Free Quantity (e.g. 10+5)</SelectItem><SelectItem value="special_price">Special Price</SelectItem></SelectContent></Select></div>
            <div><Label>Product</Label>
              <Select value={form.product_id || ""} onValueChange={(v) => set("product_id", v)}><SelectTrigger data-testid="sf-product"><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{(products?.items || []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Variant (optional — applies to all if empty)</Label>
              <Select value={form.variant_id || "all"} onValueChange={(v) => set("variant_id", v === "all" ? null : v)}><SelectTrigger><SelectValue placeholder="All variants" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All variants</SelectItem>{(selectedProduct?.variants || []).map((v) => <SelectItem key={v.id} value={v.id}>{v.pack_size} {v.unit}</SelectItem>)}</SelectContent></Select></div>
            {form.scheme_type === "special_price" ? (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Min Quantity</Label><Input type="number" value={form.min_quantity || ""} onChange={(e) => set("min_quantity", Number(e.target.value))} data-testid="sf-min" /></div>
                <div><Label>Special Price (₹)</Label><Input type="number" value={form.special_price || ""} onChange={(e) => set("special_price", Number(e.target.value))} data-testid="sf-price" /></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Buy Quantity</Label><Input type="number" value={form.buy_quantity || ""} onChange={(e) => set("buy_quantity", Number(e.target.value))} data-testid="sf-buy" /></div>
                <div><Label>Free Quantity</Label><Input type="number" value={form.free_quantity || ""} onChange={(e) => set("free_quantity", Number(e.target.value))} data-testid="sf-free" /></div>
              </div>
            )}
            <div><Label>Customer Type</Label>
              <Select value={form.customer_type || "all"} onValueChange={(v) => set("customer_type", v)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Customers</SelectItem>{CUSTOMER_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date</Label><Input type="date" value={form.start_date?.slice(0, 10) || ""} onChange={(e) => set("start_date", e.target.value ? e.target.value + "T00:00:00" : null)} /></div>
              <div><Label>End Date</Label><Input type="date" value={form.end_date?.slice(0, 10) || ""} onChange={(e) => set("end_date", e.target.value ? e.target.value + "T23:59:59" : null)} /></div>
            </div>
            <div className="flex items-center justify-between border rounded-md px-3 py-2"><Label>Active</Label><Switch checked={!!form.active} onCheckedChange={(v) => set("active", v)} data-testid="sf-active" /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => save.mutate(form)} disabled={save.isPending} data-testid="save-scheme">{save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
