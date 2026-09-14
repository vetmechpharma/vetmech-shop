import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Truck, Printer, Loader2, CheckCircle2, FileText, Save } from "lucide-react";
import { printEnvelope } from "@/lib/envelope";

export default function DispatchSection({ order, onDone }) {
  const dispatched = order.status === "dispatched" || !!order.dispatch;
  const [form, setForm] = useState(order.dispatch || { cases: "", transport: "", freight: "to_pay", dispatch_date: new Date().toISOString().slice(0, 10), invoice_number: "", invoice_value: "", invoice_date: new Date().toISOString().slice(0, 10), remarks: "" });
  const [envPrinted, setEnvPrinted] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const { data: transports } = useQuery({ queryKey: ["transports"], queryFn: async () => (await api.get("/admin/transports")).data });

  // LR is intentionally NOT collected here — it is obtained from transport and entered AFTER dispatch.
  const checklist = [
    { key: "cases", label: "No. of cases entered", ok: !!form.cases && Number(form.cases) > 0 },
    { key: "transport", label: "Transport selected", ok: !!form.transport },
    { key: "freight", label: "Freight (To Pay / Paid) selected", ok: !!form.freight },
    { key: "env", label: "Envelope printed", ok: envPrinted },
  ];
  const ready = checklist.every((c) => c.ok);

  const dispatch = useMutation({
    mutationFn: async () => (await api.post(`/admin/orders/${order.id}/dispatch`, { ...form, notify: true })).data,
    onSuccess: () => { onDone(); toast.success("Order dispatched — WhatsApp sent"); },
    onError: (e) => toast.error(apiError(e)),
  });

  if (dispatched) {
    return <DispatchedSummary order={order} onDone={onDone} transports={transports} />;
  }

  return (
    <div className="border border-vm-border rounded-xl p-4" data-testid="prepare-dispatch">
      <p className="font-heading font-bold text-vm-ink flex items-center gap-2 mb-3"><Truck className="w-5 h-5 text-vm-green" /> Prepare for Dispatch</p>
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs">No. of Cases *</Label><Input type="number" value={form.cases} onChange={(e) => set("cases", e.target.value)} data-testid="dispatch-cases" /></div>
        <div><Label className="text-xs">Transport *</Label>
          <Select value={form.transport} onValueChange={(v) => set("transport", v)}><SelectTrigger data-testid="dispatch-transport"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{(transports?.items || []).filter((t) => t.active).map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}<SelectItem value="Customer Pickup">Customer Pickup</SelectItem></SelectContent></Select>
        </div>
        <div><Label className="text-xs">Freight *</Label>
          <Select value={form.freight} onValueChange={(v) => set("freight", v)}><SelectTrigger data-testid="dispatch-freight"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="to_pay">To Pay</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent></Select>
        </div>
        <div><Label className="text-xs">Dispatch Date</Label><Input type="date" value={form.dispatch_date} onChange={(e) => set("dispatch_date", e.target.value)} data-testid="dispatch-date" /></div>
        <div><Label className="text-xs">Invoice No.</Label><Input value={form.invoice_number} onChange={(e) => set("invoice_number", e.target.value)} data-testid="dispatch-invoice-no" /></div>
        <div><Label className="text-xs">Invoice Value ₹</Label><Input type="number" value={form.invoice_value} onChange={(e) => set("invoice_value", e.target.value)} data-testid="dispatch-invoice-value" /></div>
        <div><Label className="text-xs">Invoice Date</Label><Input type="date" value={form.invoice_date} onChange={(e) => set("invoice_date", e.target.value)} data-testid="dispatch-invoice-date" /></div>
        <div><Label className="text-xs">Remarks</Label><Input value={form.remarks} onChange={(e) => set("remarks", e.target.value)} /></div>
      </div>

      <p className="text-[11px] text-slate-400 mt-2">LR / Tracking number is entered after dispatch (once received from the transporter).</p>

      <Button variant="outline" className="mt-3 w-full" onClick={() => { printEnvelope(order); setEnvPrinted(true); }} data-testid="print-envelope"><Printer className="w-4 h-4 mr-2" /> Print Envelope</Button>

      <div className="mt-3 space-y-1.5 bg-vm-bg rounded-lg p-3">
        {checklist.map((c) => (
          <div key={c.key} className="flex items-center gap-2 text-sm" data-testid={`check-${c.key}`}>
            <CheckCircle2 className={`w-4 h-4 ${c.ok ? "text-vm-green" : "text-slate-300"}`} />
            <span className={c.ok ? "text-vm-ink" : "text-slate-400"}>{c.label}</span>
          </div>
        ))}
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button className="mt-3 w-full bg-vm-green hover:bg-vm-greenhover h-12 text-base" disabled={!ready} data-testid="confirm-dispatch">
            <Truck className="w-5 h-5 mr-2" /> Confirm Dispatch
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Mark order as dispatched?</AlertDialogTitle>
            <AlertDialogDescription>This sends a WhatsApp notification to the customer and records the dispatch. You can add the LR number afterwards. Continue?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-vm-green" onClick={() => dispatch.mutate()} data-testid="confirm-dispatch-yes">{dispatch.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Yes, Dispatch"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DispatchedSummary({ order, onDone, transports }) {
  const d = order.dispatch || {};
  const [edit, setEdit] = useState({ lr_number: d.lr_number || "", invoice_number: d.invoice_number || "", invoice_value: d.invoice_value || "", invoice_date: d.invoice_date || "" });
  const set = (k, v) => setEdit((f) => ({ ...f, [k]: v }));

  const update = useMutation({
    mutationFn: async () => (await api.post(`/admin/orders/${order.id}/dispatch`, {
      cases: d.cases, transport: d.transport, freight: d.freight, dispatch_date: d.dispatch_date,
      ...edit, notify: false,
    })).data,
    onSuccess: () => { onDone(); toast.success("LR / invoice details updated"); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="border border-vm-green/30 bg-vm-green/5 rounded-xl p-4" data-testid="dispatch-summary">
      <p className="font-heading font-bold text-vm-green flex items-center gap-2"><Truck className="w-5 h-5" /> Dispatched</p>
      <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
        <span>Cases: <b>{d.cases}</b></span><span>Transport: <b>{d.transport}</b></span>
        <span>Freight: <b>{d.freight === "paid" ? "Paid" : "To Pay"}</b></span><span>Date: <b>{d.dispatch_date}</b></span>
        <span>By: <b>{d.dispatched_by}</b></span>
      </div>

      <div className="mt-4 border-t border-vm-green/20 pt-3">
        <p className="text-xs font-semibold text-vm-ink flex items-center gap-1.5 mb-2"><FileText className="w-3.5 h-3.5 text-vm-green" /> LR & Invoice (update after transporter confirms)</p>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">LR / Tracking No.</Label><Input value={edit.lr_number} onChange={(e) => set("lr_number", e.target.value)} data-testid="post-lr" /></div>
          <div><Label className="text-xs">Invoice No.</Label><Input value={edit.invoice_number} onChange={(e) => set("invoice_number", e.target.value)} data-testid="post-invoice-no" /></div>
          <div><Label className="text-xs">Invoice Value ₹</Label><Input type="number" value={edit.invoice_value} onChange={(e) => set("invoice_value", e.target.value)} data-testid="post-invoice-value" /></div>
          <div><Label className="text-xs">Invoice Date</Label><Input type="date" value={edit.invoice_date} onChange={(e) => set("invoice_date", e.target.value)} data-testid="post-invoice-date" /></div>
        </div>
        <Button size="sm" className="mt-2 bg-vm-green hover:bg-vm-greenhover" onClick={() => update.mutate()} disabled={update.isPending} data-testid="save-lr-invoice">{update.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Save LR / Invoice</Button>
      </div>

      <Button variant="outline" size="sm" className="mt-3" onClick={() => printEnvelope(order)} data-testid="reprint-envelope"><Printer className="w-4 h-4 mr-1" /> Reprint Envelope</Button>
    </div>
  );
}
