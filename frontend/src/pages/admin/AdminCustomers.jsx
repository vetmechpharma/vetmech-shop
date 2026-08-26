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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Eye, Plus, Check, X, Ban, RotateCw, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CUSTOMER_CATEGORIES, CUSTOMER_STATUSES, customerStatusMeta, statusMeta, PREFIXES } from "@/lib/constants";
import { exportRows } from "@/lib/exportUtils";

export default function AdminCustomers() {
  const qc = useQueryClient();
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-customers", category, status, q],
    queryFn: async () => (await api.get("/admin/customers", { params: { category: category !== "all" ? category : undefined, status: status !== "all" ? status : undefined, q: q || undefined, limit: 100 } })).data,
  });
  const { data: pending } = useQuery({ queryKey: ["cust-pending-count"], queryFn: async () => (await api.get("/admin/customers-pending-count")).data });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["admin-customers"] }); qc.invalidateQueries({ queryKey: ["cust-pending-count"] }); };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div><h1 className="font-heading text-2xl font-bold text-vm-ink">Customers</h1><p className="text-slate-500 text-sm">Registrations, approvals & accounts{pending?.count ? ` · ${pending.count} pending approval` : ""}</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportRows((data?.items || []).map((c) => ({ Name: c.name, Company: c.company_name, Mobile: c.mobile, Category: c.category, Status: c.status_label, Orders: c.order_count })), "vetmech-customers", "csv")}>Export CSV</Button>
          <Button size="sm" className="bg-vm-green hover:bg-vm-greenhover" onClick={() => setAddOpen(true)} data-testid="add-customer-btn"><Plus className="w-4 h-4 mr-1" /> Add Customer</Button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[{ value: "all", label: "All" }, ...CUSTOMER_STATUSES.filter((s) => s.value !== "deleted")].map((s) => (
          <button key={s.value} onClick={() => setStatus(s.value)} data-testid={`status-tab-${s.value}`}
            className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${status === s.value ? "bg-vm-green text-white border-vm-green" : "bg-white text-slate-600 border-[#E2E8F0] hover:border-vm-accent"}`}>
            {s.label}{s.value === "pending" && pending?.count ? ` (${pending.count})` : ""}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        <Input placeholder="Search name, mobile, company, email..." value={q} onChange={(e) => setQ(e.target.value)} className="w-64" data-testid="customer-search" />
        <Select value={category} onValueChange={setCategory}><SelectTrigger className="w-48" data-testid="customer-category-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Categories</SelectItem>{CUSTOMER_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select>
      </div>

      <div className="border border-[#E2E8F0] rounded-lg overflow-x-auto bg-white">
        <Table>
          <TableHeader><TableRow className="bg-vm-bg"><TableHead>Name</TableHead><TableHead>Company</TableHead><TableHead>Mobile</TableHead><TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead className="text-center">Orders</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></TableCell></TableRow>
              : (data?.items || []).length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-slate-400">No customers found.</TableCell></TableRow>
              : data.items.map((c) => {
                const sm = customerStatusMeta(c.status);
                return (
                  <TableRow key={c.id} data-testid={`customer-row-${c.id}`}>
                    <TableCell className="font-medium text-vm-ink">{c.prefix} {c.name}</TableCell>
                    <TableCell className="text-sm">{c.company_name || "—"}</TableCell>
                    <TableCell className="text-sm">{c.mobile}</TableCell>
                    <TableCell className="text-sm">{CUSTOMER_CATEGORIES.find((x) => x.value === c.category)?.label}</TableCell>
                    <TableCell><span className={`text-xs px-2 py-0.5 rounded ${sm.color}`}>{sm.label}</span></TableCell>
                    <TableCell className="text-center">{c.order_count}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {c.status === "pending" && <StatusBtn cid={c.id} action="approve" invalidate={invalidate} icon={Check} cls="text-green-600" title="Approve" />}
                      {c.status === "pending" && <StatusBtn cid={c.id} action="reject" invalidate={invalidate} icon={X} cls="text-red-500" title="Reject" />}
                      {c.status === "active" && <StatusBtn cid={c.id} action="suspend" invalidate={invalidate} icon={Ban} cls="text-amber-600" title="Suspend" />}
                      {(c.status === "suspended" || c.status === "rejected") && <StatusBtn cid={c.id} action="reactivate" invalidate={invalidate} icon={RotateCw} cls="text-green-600" title="Reactivate" />}
                      <Button variant="ghost" size="icon" onClick={() => setDetailId(c.id)} data-testid={`view-customer-${c.id}`}><Eye className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!detailId} onOpenChange={(v) => !v && setDetailId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto"><CustomerDetail id={detailId} onChange={invalidate} onClose={() => setDetailId(null)} /></SheetContent>
      </Sheet>
      <AddCustomerDialog open={addOpen} onOpenChange={setAddOpen} onCreated={invalidate} />
    </div>
  );
}

function StatusBtn({ cid, action, invalidate, icon: Icon, cls, title }) {
  const m = useMutation({
    mutationFn: async () => (await api.post(`/admin/customers/${cid}/${action}`)).data,
    onSuccess: () => { invalidate(); toast.success(`Customer ${action}d`); },
    onError: (e) => toast.error(apiError(e)),
  });
  return <Button variant="ghost" size="icon" className={cls} title={title} onClick={() => m.mutate()} disabled={m.isPending} data-testid={`cust-${action}-${cid}`}><Icon className="w-4 h-4" /></Button>;
}

function CustomerDetail({ id, onChange, onClose }) {
  const qc = useQueryClient();
  const { data: c } = useQuery({ queryKey: ["admin-customer", id], queryFn: async () => (await api.get(`/admin/customers/${id}`)).data, enabled: !!id });
  const [pwd, setPwd] = useState("");
  const [pwdOpen, setPwdOpen] = useState(false);

  const changeCat = useMutation({
    mutationFn: async (category) => (await api.post(`/admin/customers/${id}/change-category`, { category })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-customer", id] }); onChange(); toast.success("Category updated"); },
    onError: (e) => toast.error(apiError(e)),
  });
  const resetPwd = useMutation({
    mutationFn: async () => (await api.post(`/admin/customers/${id}/reset-password`, { password: pwd })).data,
    onSuccess: () => { setPwd(""); setPwdOpen(false); toast.success("Password reset"); },
    onError: (e) => toast.error(apiError(e)),
  });
  const del = useMutation({
    mutationFn: async () => (await api.delete(`/admin/customers/${id}`)).data,
    onSuccess: () => { onChange(); onClose(); toast.success("Customer deleted"); },
    onError: (e) => toast.error(apiError(e)),
  });

  if (!c) return <div className="py-20 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;
  const sm = customerStatusMeta(c.status);
  return (
    <>
      <SheetHeader><SheetTitle className="font-heading flex items-center gap-2">{c.prefix} {c.name}<span className={`text-xs px-2 py-0.5 rounded ${sm.color}`}>{sm.label}</span></SheetTitle></SheetHeader>
      <div className="mt-4 space-y-4 text-sm">
        <div className="bg-vm-bg rounded-lg p-3">
          <p>{c.company_name}</p>
          <p className="text-slate-500">{c.mobile}{c.email ? ` · ${c.email}` : ""}</p>
          <p className="text-slate-500 mt-1">{c.address}{c.district ? `, ${c.district}` : ""}{c.state ? `, ${c.state}` : ""}{c.pincode ? ` - ${c.pincode}` : ""}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Customer Category</Label>
            <Select value={c.category} onValueChange={(v) => changeCat.mutate(v)}><SelectTrigger className="mt-1" data-testid="detail-change-category"><SelectValue /></SelectTrigger>
              <SelectContent>{CUSTOMER_CATEGORIES.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="flex items-end gap-2">
            <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
              <Button variant="outline" size="sm" onClick={() => setPwdOpen(true)} data-testid="detail-reset-pw"><KeyRound className="w-4 h-4 mr-1" /> Reset Password</Button>
              <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Set new password</DialogTitle></DialogHeader>
                <Input type="text" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="New password" data-testid="detail-pw-input" />
                <DialogFooter><Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => resetPwd.mutate()} disabled={resetPwd.isPending} data-testid="detail-pw-save">Save</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {c.status === "pending" && <StatusBtnWide cid={id} action="approve" onChange={onChange} label="Approve" cls="bg-vm-green hover:bg-vm-greenhover text-white" />}
          {c.status === "pending" && <StatusBtnWide cid={id} action="reject" onChange={onChange} label="Reject" cls="border border-red-300 text-red-600" />}
          {c.status === "active" && <StatusBtnWide cid={id} action="suspend" onChange={onChange} label="Suspend" cls="border border-amber-300 text-amber-700" />}
          {(c.status === "suspended" || c.status === "rejected") && <StatusBtnWide cid={id} action="reactivate" onChange={onChange} label="Reactivate" cls="bg-vm-green hover:bg-vm-greenhover text-white" />}
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="text-red-500" data-testid="detail-delete"><Trash2 className="w-4 h-4 mr-1" /> Delete</Button></AlertDialogTrigger>
            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {c.name}?</AlertDialogTitle><AlertDialogDescription>The account will be marked deleted and can no longer log in. Order history is preserved.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600" onClick={() => del.mutate()}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
          </AlertDialog>
        </div>

        {c.frequent_products?.length > 0 && (
          <div><p className="font-medium text-vm-ink mb-1">Frequently Ordered</p>{c.frequent_products.map((p, i) => <div key={i} className="flex justify-between text-slate-600 border-b border-slate-50 py-1"><span>{p.name}</span><span>{p.qty}</span></div>)}</div>
        )}
        <div>
          <p className="font-medium text-vm-ink mb-1">Order History ({c.orders?.length || 0})</p>
          {(c.orders || []).map((o) => (
            <div key={o.id} className="flex justify-between items-center border border-[#E2E8F0] rounded p-2 mb-2">
              <div><span className="font-medium text-vm-green">{o.order_number}</span><br /><span className="text-xs text-slate-400">{new Date(o.created_at).toLocaleDateString()} · {o.total_qty} qty</span></div>
              <span className={`text-xs px-2 py-0.5 rounded ${statusMeta(o.status).color}`}>{statusMeta(o.status).label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function StatusBtnWide({ cid, action, onChange, label, cls }) {
  const m = useMutation({
    mutationFn: async () => (await api.post(`/admin/customers/${cid}/${action}`)).data,
    onSuccess: () => { onChange(); toast.success(`Customer ${action}d`); },
    onError: (e) => toast.error(apiError(e)),
  });
  return <Button size="sm" className={cls} onClick={() => m.mutate()} disabled={m.isPending} data-testid={`detail-${action}`}>{label}</Button>;
}

const emptyC = { prefix: "Dr.", name: "", mobile: "", whatsapp: "", email: "", company_name: "", address: "", pincode: "", district: "", state: "", category: "doctor", status: "active", password: "" };
function AddCustomerDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(emptyC);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const create = useMutation({
    mutationFn: async () => (await api.post("/admin/customers", form)).data,
    onSuccess: () => { onCreated(); onOpenChange(false); setForm(emptyC); toast.success("Customer created"); },
    onError: (e) => toast.error(apiError(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-heading">Add Customer</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Prefix</Label><Select value={form.prefix} onValueChange={(v) => set("prefix", v)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{PREFIXES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Name *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} className="mt-1" data-testid="add-name" /></div>
          <div><Label className="text-xs">Mobile *</Label><Input value={form.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, ""))} maxLength={10} className="mt-1" data-testid="add-mobile" /></div>
          <div><Label className="text-xs">WhatsApp</Label><Input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value.replace(/\D/g, ""))} maxLength={10} className="mt-1" /></div>
          <div><Label className="text-xs">Email</Label><Input value={form.email} onChange={(e) => set("email", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs">Company</Label><Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} className="mt-1" /></div>
          <div className="col-span-2"><Label className="text-xs">Address</Label><Textarea value={form.address} onChange={(e) => set("address", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs">Pincode</Label><Input value={form.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} maxLength={6} className="mt-1" /></div>
          <div><Label className="text-xs">District</Label><Input value={form.district} onChange={(e) => set("district", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs">Category</Label><Select value={form.category} onValueChange={(v) => set("category", v)}><SelectTrigger className="mt-1" data-testid="add-category"><SelectValue /></SelectTrigger><SelectContent>{CUSTOMER_CATEGORIES.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Status</Label><Select value={form.status} onValueChange={(v) => set("status", v)}><SelectTrigger className="mt-1" data-testid="add-status"><SelectValue /></SelectTrigger><SelectContent>{CUSTOMER_STATUSES.filter((s) => s.value !== "deleted").map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="col-span-2"><Label className="text-xs">Password (optional)</Label><Input type="text" value={form.password} onChange={(e) => set("password", e.target.value)} className="mt-1" placeholder="Set for password login" /></div>
        </div>
        <DialogFooter><Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => create.mutate()} disabled={create.isPending} data-testid="add-customer-save">{create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
