import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Truck, Printer, Loader2, CheckCircle2 } from "lucide-react";
import { printEnvelope } from "@/lib/envelope";

export default function DispatchSection({ order, onDone }) {
  const dispatched = order.status === "dispatched" || !!order.dispatch;
  const [form, setForm] = useState(order.dispatch || { cases: "", transport: "", freight: "to_pay", lr_number: "", dispatch_date: new Date().toISOString().slice(0, 10), remarks: "" });
  const [envPrinted, setEnvPrinted] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const { data: transports } = useQuery({ queryKey: ["transports"], queryFn: async () => (await api.get("/admin/transports")).data });

  const checklist = [
    { key: "cases", label: "No. of cases entered", ok: !!form.cases && Number(form.cases) > 0 },
    { key: "transport", label: "Transport selected", ok: !!form.transport },
    { key: "freight", label: "Freight (To Pay / Paid) selected", ok: !!form.freight },
    { key: "lr", label: "LR / Tracking number entered", ok: !!form.lr_number || form.transport === "Customer Pickup" },
    { key: "env", label: "Envelope printed", ok: envPrinted },
  ];
  const ready = checklist.every((c) => c.ok);

  const dispatch = useMutation({
    mutationFn: async () => (await api.post(`/admin/orders/${order.id}/dispatch`, { ...form, notify: true })).data,
    onSuccess: () => { onDone(); toast.success("Order dispatched — WhatsApp sent"); },
    onError: (e) => toast.error(apiError(e)),
  });

  if (dispatched) {
    const d = order.dispatch || {};
    return (
      <div className="border border-vm-green/30 bg-vm-green/5 rounded-xl p-4" data-testid="dispatch-summary">
        <p className="font-heading font-bold text-vm-green flex items-center gap-2"><Truck className="w-5 h-5" /> Dispatched</p>
        <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
          <span>Cases: <b>{d.cases}</b></span><span>Transport: <b>{d.transport}</b></span>
          <span>Freight: <b>{d.freight === "paid" ? "Paid" : "To Pay"}</b></span><span>LR: <b>{d.lr_number || "—"}</b></span>
          <span>Date: <b>{d.dispatch_date}</b></span><span>By: <b>{d.dispatched_by}</b></span>
        </div>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => printEnvelope(order)} data-testid="reprint-envelope"><Printer className="w-4 h-4 mr-1" /> Reprint Envelope</Button>
      </div>
    );
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
        <div><Label className="text-xs">LR / Tracking No. *</Label><Input value={form.lr_number} onChange={(e) => set("lr_number", e.target.value)} data-testid="dispatch-lr" /></div>
        <div><Label className="text-xs">Dispatch Date</Label><Input type="date" value={form.dispatch_date} onChange={(e) => set("dispatch_date", e.target.value)} data-testid="dispatch-date" /></div>
        <div><Label className="text-xs">Remarks</Label><Input value={form.remarks} onChange={(e) => set("remarks", e.target.value)} /></div>
      </div>

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
            <AlertDialogDescription>This sends a WhatsApp notification to the customer and records the dispatch. Continue?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-vm-green" onClick={() => dispatch.mutate()} data-testid="confirm-dispatch-yes">{dispatch.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Yes, Dispatch"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
