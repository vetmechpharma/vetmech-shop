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
import { toast } from "sonner";
import { Loader2, Eye, Download, FileText } from "lucide-react";
import { ORDER_STATUSES, statusMeta, CUSTOMER_CATEGORIES } from "@/lib/constants";
import { exportRows } from "@/lib/exportUtils";

export default function AdminOrders() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [detailId, setDetailId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders", status, q],
    queryFn: async () => (await api.get("/admin/orders", { params: { status: status !== "all" ? status : undefined, q: q || undefined, limit: 100 } })).data,
  });

  const doExport = (type) => {
    const rows = (data?.items || []).map((o) => ({
      OrderNumber: o.order_number, Date: new Date(o.created_at).toLocaleString(), Customer: o.customer_name,
      Company: o.company_name, Mobile: o.customer_mobile, Category: o.customer_category,
      Products: o.items.length, OrderedQty: o.total_qty, FreeQty: o.total_free, Status: statusMeta(o.status).label,
    }));
    exportRows(rows, `vetmech-orders`, type);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div><h1 className="font-heading text-2xl font-bold text-vm-ink">Orders</h1><p className="text-slate-500 text-sm">Manage and track all orders</p></div>
        <div className="flex gap-2">
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
          <TableHeader><TableRow className="bg-vm-bg"><TableHead>Order #</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead className="text-center">Qty</TableHead><TableHead className="text-center">Free</TableHead><TableHead>Status</TableHead><TableHead className="text-right">View</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></TableCell></TableRow>
              : (data?.items || []).length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-slate-400">No orders found.</TableCell></TableRow>
              : data.items.map((o) => (
                <TableRow key={o.id} data-testid={`order-row-${o.order_number}`}>
                  <TableCell className="font-medium text-vm-green">{o.order_number}</TableCell>
                  <TableCell><span className="text-vm-ink">{o.customer_name}</span><br /><span className="text-xs text-slate-400">{o.customer_mobile}</span></TableCell>
                  <TableCell className="text-sm text-slate-500">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-center">{o.total_qty}</TableCell>
                  <TableCell className="text-center text-vm-accent">{o.total_free}</TableCell>
                  <TableCell><span className={`text-xs font-semibold px-2.5 py-1 rounded ${statusMeta(o.status).color}`}>{statusMeta(o.status).label}</span></TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => setDetailId(o.id)} data-testid={`view-order-${o.order_number}`}><Eye className="w-4 h-4" /></Button></TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <OrderDetail id={detailId} onClose={() => setDetailId(null)} onChange={() => qc.invalidateQueries({ queryKey: ["admin-orders"] })} />
    </div>
  );
}

function OrderDetail({ id, onClose, onChange }) {
  const qc = useQueryClient();
  const { data: order } = useQuery({ queryKey: ["admin-order", id], queryFn: async () => (await api.get(`/admin/orders/${id}`)).data, enabled: !!id });
  const [notes, setNotes] = useState("");

  const setStatus = useMutation({
    mutationFn: async (status) => (await api.patch(`/admin/orders/${id}/status`, { status })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-order", id] }); onChange(); toast.success("Status updated — WhatsApp notification sent"); },
    onError: (e) => toast.error(apiError(e)),
  });
  const saveNotes = useMutation({
    mutationFn: async () => (await api.put(`/admin/orders/${id}`, { internal_notes: notes })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-order", id] }); toast.success("Notes saved"); },
  });

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
              </div>

              <div>
                <Label>Products</Label>
                <div className="border rounded-lg mt-1 divide-y">
                  {order.items.map((l) => (
                    <div key={l.variant_id} className="p-3 flex justify-between">
                      <div><p className="font-medium text-vm-ink">{l.product_name}</p><p className="text-xs text-slate-400">{l.pack_size} {l.unit} · ₹{l.unit_price}</p></div>
                      <div className="text-right"><p className="text-vm-ink">Qty {l.qty}</p>{l.free_qty > 0 && <p className="text-xs text-vm-accent">+{l.free_qty} free ({l.scheme_label})</p>}<p className="text-xs text-slate-400">Dispatch {l.dispatch_qty}</p></div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 mt-2 text-xs"><span>Ordered <strong>{order.total_qty}</strong></span><span>Free <strong className="text-vm-accent">{order.total_free}</strong></span><span>Dispatch <strong className="text-vm-green">{order.total_dispatch}</strong></span></div>
              </div>

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
