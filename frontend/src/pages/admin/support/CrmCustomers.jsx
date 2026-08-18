import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import TicketDetailSheet from "@/components/admin/support/TicketDetailSheet";
import { StatusBadge } from "@/components/admin/support/TicketBadges";
import { CUSTOMER_TYPES } from "@/lib/ticketConstants";
import { toast } from "sonner";
import { Loader2, Plus, Eye, Phone, MessageCircle, Mail, MapPin, Search } from "lucide-react";

export function CustomerDialog({ open, onOpenChange, editing, onSaved }) {
  const [form, setForm] = useState({});
  const qc = useQueryClient();
  React.useEffect(() => { setForm(editing || { customer_type: "Veterinary Clinic" }); }, [editing, open]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: async () => editing?.id ? (await api.put(`/crm/customers/${editing.id}`, form)).data : (await api.post("/crm/customers", form)).data,
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["crm-customers"] }); toast.success("Saved"); onSaved?.(d); onOpenChange(false); },
    onError: (e) => toast.error(apiError(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="crm-dialog">
        <DialogHeader><DialogTitle className="font-heading">{editing?.id ? "Edit" : "New"} Customer</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Contact Person</Label><Input value={form.contact_name || ""} onChange={(e) => set("contact_name", e.target.value)} data-testid="crm-contact" /></div>
          <div><Label>Company / Clinic</Label><Input value={form.company_name || ""} onChange={(e) => set("company_name", e.target.value)} data-testid="crm-company" /></div>
          <div><Label>Phone</Label><Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} data-testid="crm-phone" /></div>
          <div><Label>Alternate Phone</Label><Input value={form.alt_phone || ""} onChange={(e) => set("alt_phone", e.target.value)} /></div>
          <div><Label>Email</Label><Input value={form.email || ""} onChange={(e) => set("email", e.target.value)} /></div>
          <div><Label>Customer Type</Label><Select value={form.customer_type} onValueChange={(v) => set("customer_type", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CUSTOMER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
          <div className="sm:col-span-2"><Label>Address</Label><Input value={form.address || ""} onChange={(e) => set("address", e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>Notes</Label><Textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-3"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => save.mutate()} disabled={save.isPending} data-testid="save-crm">{save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save</Button></div>
      </DialogContent>
    </Dialog>
  );
}

export default function CrmCustomers() {
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [ticketId, setTicketId] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ["crm-customers", q], queryFn: async () => (await api.get("/crm/customers", { params: { q: q || undefined } })).data });

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div><h1 className="font-heading text-2xl font-bold text-vm-ink">Customers</h1><p className="text-slate-500 text-sm">Customer database</p></div>
        <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => { setEditing(null); setDialog(true); }} data-testid="add-customer"><Plus className="w-4 h-4 mr-2" /> Add Customer</Button>
      </div>
      <div className="relative mb-4 max-w-sm"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Search name, company, phone, email..." value={q} onChange={(e) => setQ(e.target.value)} data-testid="crm-search" /></div>

      <div className="border border-[#E2E8F0] rounded-lg overflow-x-auto bg-white">
        <Table>
          <TableHeader><TableRow className="bg-vm-bg"><TableHead>Company</TableHead><TableHead>Contact</TableHead><TableHead>Type</TableHead><TableHead>Phone</TableHead><TableHead className="text-center">Tickets</TableHead><TableHead className="text-right">View</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></TableCell></TableRow>
              : (data?.items || []).map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setDetailId(c.id)} data-testid={`crm-row-${c.id}`}>
                  <TableCell className="font-medium text-vm-ink">{c.company_name}</TableCell>
                  <TableCell className="text-sm">{c.contact_name}</TableCell>
                  <TableCell className="text-sm">{c.customer_type}</TableCell>
                  <TableCell className="text-sm">{c.phone}</TableCell>
                  <TableCell className="text-center">{c.ticket_count}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="icon"><Eye className="w-4 h-4" /></Button></TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <CustomerDialog open={dialog} onOpenChange={setDialog} editing={editing} />
      <CustomerProfile id={detailId} onClose={() => setDetailId(null)} onEdit={(c) => { setEditing(c); setDialog(true); }} onOpenTicket={(tid) => setTicketId(tid)} />
      <TicketDetailSheet id={ticketId} onClose={() => setTicketId(null)} />
    </div>
  );
}

function CustomerProfile({ id, onClose, onEdit, onOpenTicket }) {
  const { data: c } = useQuery({ queryKey: ["crm-customer", id], queryFn: async () => (await api.get(`/crm/customers/${id}`)).data, enabled: !!id });
  return (
    <Sheet open={!!id} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="customer-profile">
        {!c ? <div className="py-20 text-center text-slate-400"><SheetHeader><SheetTitle className="sr-only">Customer</SheetTitle></SheetHeader><Loader2 className="w-5 h-5 animate-spin inline" /></div> : (
          <>
            <SheetHeader><SheetTitle className="font-heading">{c.company_name}</SheetTitle></SheetHeader>
            <p className="text-sm text-slate-500">{c.contact_name} · {c.customer_type}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <a href={`tel:${c.phone}`}><Button size="sm" variant="outline" className="h-8"><Phone className="w-3.5 h-3.5 mr-1" />Call</Button></a>
              <a href={`https://wa.me/91${c.phone}`} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="h-8"><MessageCircle className="w-3.5 h-3.5 mr-1" />WhatsApp</Button></a>
              <a href={`mailto:${c.email}`}><Button size="sm" variant="outline" className="h-8"><Mail className="w-3.5 h-3.5 mr-1" />Email</Button></a>
              <Button size="sm" variant="outline" className="h-8" onClick={() => onEdit(c)}>Edit</Button>
            </div>
            <div className="text-sm text-slate-500 mt-3 flex gap-2"><MapPin className="w-4 h-4 flex-shrink-0" />{c.address}</div>

            <div className="grid grid-cols-5 gap-2 mt-5 text-center">
              {[["Total", c.stats.total], ["Open", c.stats.open], ["Pending", c.stats.pending], ["Done", c.stats.completed], ["Overdue", c.stats.overdue]].map(([l, v]) => (
                <div key={l} className="bg-vm-bg rounded-lg py-2"><p className="font-heading font-bold text-vm-ink">{v}</p><p className="text-[10px] text-slate-500">{l}</p></div>
              ))}
            </div>

            <div className="mt-5">
              <h4 className="font-heading font-bold text-vm-ink mb-2">Ticket History</h4>
              <div className="space-y-2">
                {c.tickets.map((t) => (
                  <div key={t.id} className="flex justify-between items-center border rounded p-2 cursor-pointer hover:bg-vm-bg" onClick={() => onOpenTicket(t.id)}>
                    <div><span className="font-medium text-vm-green text-sm">{t.ticket_number}</span><p className="text-xs text-slate-500">{t.title}</p></div>
                    <StatusBadge status={t.effective_status} />
                  </div>
                ))}
                {c.tickets.length === 0 && <p className="text-sm text-slate-400">No tickets yet.</p>}
              </div>
            </div>

            <div className="mt-5">
              <h4 className="font-heading font-bold text-vm-ink mb-2">Activity Timeline</h4>
              <div className="space-y-2 border-l-2 border-vm-accent/30 pl-3">
                {c.timeline.map((a, i) => <div key={i} className="text-sm"><p className="text-vm-ink">{a.message || a.action} <span className="text-vm-green">{a.ticket_number}</span></p><p className="text-xs text-slate-400">{new Date(a.at).toLocaleString()}</p></div>)}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
