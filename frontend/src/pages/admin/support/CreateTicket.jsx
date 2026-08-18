import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ImageUpload from "@/components/admin/ImageUpload";
import { CustomerDialog } from "./CrmCustomers";
import { PRIORITIES } from "@/lib/ticketConstants";
import { toast } from "sonner";
import { Loader2, Plus, UserPlus, Paperclip, X } from "lucide-react";

export default function CreateTicket() {
  const nav = useNavigate();
  const [form, setForm] = useState({ priority: "Normal", attachments: [] });
  const [saving, setSaving] = useState(false);
  const [custDialog, setCustDialog] = useState(false);
  const [custQ, setCustQ] = useState("");

  const { data: customers, refetch: refetchCust } = useQuery({ queryKey: ["crm-customers", custQ], queryFn: async () => (await api.get("/crm/customers", { params: { q: custQ || undefined, limit: 100 } })).data });
  const { data: staff } = useQuery({ queryKey: ["ticket-staff"], queryFn: async () => (await api.get("/tickets/staff")).data });
  const { data: config } = useQuery({ queryKey: ["ticket-config"], queryFn: async () => (await api.get("/tickets/config")).data });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.customer_id) { toast.error("Please select a customer"); return; }
    if (!form.title) { toast.error("Ticket title required"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/tickets", form);
      toast.success(`Ticket ${data.ticket_number} created`);
      nav("/admin/support/tickets");
    } catch (e) { toast.error(apiError(e)); }
    setSaving(false);
  };

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl font-bold text-vm-ink mb-6">Create Ticket</h1>
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
        <div>
          <div className="flex items-center justify-between"><Label>Customer</Label><Button size="sm" variant="outline" onClick={() => setCustDialog(true)} data-testid="new-customer-inline"><UserPlus className="w-3.5 h-3.5 mr-1" /> New Customer</Button></div>
          <Input className="mt-2 mb-2" placeholder="Search customer..." value={custQ} onChange={(e) => setCustQ(e.target.value)} data-testid="ct-customer-search" />
          <Select value={form.customer_id || ""} onValueChange={(v) => set("customer_id", v)}>
            <SelectTrigger data-testid="ct-customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
            <SelectContent className="max-h-64">{(customers?.items || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name} — {c.contact_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div><Label>Ticket Title</Label><Input value={form.title || ""} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Discuss VETMECH Mastitis product range" data-testid="ct-title" /></div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Ticket Type</Label><Select value={form.type || ""} onValueChange={(v) => set("type", v)}><SelectTrigger data-testid="ct-type"><SelectValue placeholder="Select type" /></SelectTrigger><SelectContent>{(config?.types || []).map((t) => <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Priority</Label><Select value={form.priority} onValueChange={(v) => set("priority", v)}><SelectTrigger data-testid="ct-priority"><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.value}</SelectItem>)}</SelectContent></Select></div>
        </div>

        <div><Label>Description</Label><Textarea rows={4} value={form.description || ""} onChange={(e) => set("description", e.target.value)} data-testid="ct-description" /></div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Assign To</Label><Select value={form.assignee_id || ""} onValueChange={(v) => set("assignee_id", v)}><SelectTrigger data-testid="ct-assignee"><SelectValue placeholder="Select employee" /></SelectTrigger><SelectContent>{(staff || []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Due Date</Label><Input type="date" value={form.due_date?.slice(0, 10) || ""} onChange={(e) => set("due_date", e.target.value ? e.target.value + "T18:00:00" : null)} data-testid="ct-due" /></div>
          <div><Label>Reminder (optional)</Label><Input type="datetime-local" value={form.reminder || ""} onChange={(e) => set("reminder", e.target.value)} /></div>
        </div>

        <div>
          <Label className="flex items-center gap-1"><Paperclip className="w-4 h-4" /> Attachments</Label>
          <div className="flex flex-wrap gap-2 my-2">
            {form.attachments.map((a, i) => (
              <div key={i} className="flex items-center gap-1 bg-vm-bg rounded px-2 py-1 text-xs">{a.filename}<button onClick={() => set("attachments", form.attachments.filter((_, x) => x !== i))}><X className="w-3 h-3" /></button></div>
            ))}
          </div>
          <ImageUpload label="" value="" accept="*/*" onChange={(url) => url && set("attachments", [...form.attachments, { id: Math.random().toString(36).slice(2), filename: url.split("/").pop(), url, size: 0 }])} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => nav("/admin/support/tickets")}>Cancel</Button>
          <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={submit} disabled={saving} data-testid="submit-ticket">{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create Ticket</Button>
        </div>
      </div>

      <CustomerDialog open={custDialog} onOpenChange={setCustDialog} editing={null} onSaved={(c) => { refetchCust(); set("customer_id", c.id); }} />
    </div>
  );
}
