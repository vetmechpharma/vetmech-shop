import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, mediaUrl, apiError } from "@/lib/api";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, PriorityBadge } from "./TicketBadges";
import ImageUpload from "@/components/admin/ImageUpload";
import { TICKET_STATUSES } from "@/lib/ticketConstants";
import { toast } from "sonner";
import { Phone, MessageCircle, Mail, MapPin, Clock, Paperclip, Send, Loader2, Download, Trash2, User } from "lucide-react";

export default function TicketDetailSheet({ id, onClose, onChanged }) {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const { data: t } = useQuery({ queryKey: ["ticket", id], queryFn: async () => (await api.get(`/tickets/${id}`)).data, enabled: !!id });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["ticket", id] }); onChanged?.(); };

  const setStatus = useMutation({
    mutationFn: async (status) => (await api.patch(`/tickets/${id}/status`, { status })).data,
    onSuccess: () => { invalidate(); toast.success("Status updated"); }, onError: (e) => toast.error(apiError(e)),
  });
  const addUpdate = useMutation({
    mutationFn: async () => (await api.post(`/tickets/${id}/updates`, { message })).data,
    onSuccess: () => { invalidate(); setMessage(""); toast.success("Update added"); },
  });
  const addAttachment = useMutation({
    mutationFn: async (att) => (await api.post(`/tickets/${id}/attachments`, att)).data,
    onSuccess: () => { invalidate(); toast.success("Attachment added"); },
  });
  const delAttachment = useMutation({
    mutationFn: async (aid) => (await api.delete(`/tickets/${id}/attachments/${aid}`)).data,
    onSuccess: () => { invalidate(); },
  });

  const QUICK = ["Customer contacted by phone", "Meeting completed", "Customer requested quotation",
    "Waiting for customer response", "Product replacement approved", "Material dispatched", "Follow-up required"];

  return (
    <Sheet open={!!id} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto" data-testid="ticket-detail-sheet">
        {!t ? <div className="py-20 text-center text-slate-400"><SheetHeader><SheetTitle className="sr-only">Ticket</SheetTitle></SheetHeader><Loader2 className="w-5 h-5 animate-spin inline" /></div> : (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2 flex-wrap">
                <SheetTitle className="font-heading text-vm-green">{t.ticket_number}</SheetTitle>
                <StatusBadge status={t.effective_status} /><PriorityBadge priority={t.priority} />
              </div>
            </SheetHeader>
            <p className="font-heading font-bold text-vm-ink text-lg mt-2">{t.title}</p>
            <p className="text-xs text-slate-400">{t.type}</p>

            {/* Customer + quick actions */}
            <div className="bg-vm-bg rounded-lg p-3 mt-4 text-sm">
              <p className="font-medium text-vm-ink">{t.company_name}</p>
              <p className="text-slate-500">{t.customer_name} · {t.customer_phone}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <a href={`tel:${t.customer_phone}`}><Button size="sm" variant="outline" className="h-8" data-testid="qa-call"><Phone className="w-3.5 h-3.5 mr-1" />Call</Button></a>
                <a href={`https://wa.me/91${t.customer_phone}`} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="h-8" data-testid="qa-whatsapp"><MessageCircle className="w-3.5 h-3.5 mr-1" />WhatsApp</Button></a>
                <a href={`mailto:${t.customer_email}`}><Button size="sm" variant="outline" className="h-8"><Mail className="w-3.5 h-3.5 mr-1" />Email</Button></a>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
              <div><Label className="text-xs text-slate-400">Assigned To</Label><p className="flex items-center gap-1 text-vm-ink"><User className="w-3.5 h-3.5" />{t.assignee_name}</p></div>
              <div><Label className="text-xs text-slate-400">Due Date</Label><p className="text-vm-ink">{t.due_date ? new Date(t.due_date).toLocaleDateString() : "—"}{t.is_overdue && <span className="text-red-600 ml-1">({t.days_overdue}d overdue)</span>}</p></div>
            </div>

            {t.description && <div className="mt-4"><Label className="text-xs text-slate-400">Description</Label><p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{t.description}</p></div>}

            {/* Status control */}
            <div className="mt-4">
              <Label>Change Status</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {TICKET_STATUSES.filter((s) => s.value !== "overdue").map((s) => (
                  <Button key={s.value} size="sm" variant={t.status === s.value ? "default" : "outline"}
                    className={t.status === s.value ? "bg-vm-green" : ""} onClick={() => setStatus.mutate(s.value)} data-testid={`set-status-${s.value}`}>{s.label}</Button>
                ))}
              </div>
            </div>

            {/* Add update */}
            <div className="mt-5">
              <Label>Add Update</Label>
              <div className="flex flex-wrap gap-1.5 my-2">
                {QUICK.map((qtxt) => <button key={qtxt} onClick={() => setMessage(qtxt)} className="text-[11px] bg-slate-100 hover:bg-slate-200 rounded px-2 py-1 text-slate-600">{qtxt}</button>)}
              </div>
              <div className="flex gap-2">
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Write an update..." data-testid="update-message" />
                <Button className="bg-vm-green hover:bg-vm-greenhover self-end" onClick={() => addUpdate.mutate()} disabled={!message} data-testid="add-update-btn"><Send className="w-4 h-4" /></Button>
              </div>
            </div>

            {/* Attachments */}
            <div className="mt-5">
              <Label className="flex items-center gap-1"><Paperclip className="w-4 h-4" /> Attachments</Label>
              <div className="space-y-1 my-2">
                {(t.attachments || []).map((a) => (
                  <div key={a.id} className="flex items-center justify-between border rounded p-2 text-sm">
                    <a href={mediaUrl(a.url)} target="_blank" rel="noreferrer" className="text-vm-green truncate flex-1">{a.filename}</a>
                    <div className="flex gap-1">
                      <a href={mediaUrl(a.url)} target="_blank" rel="noreferrer" download><Button size="icon" variant="ghost" className="h-7 w-7"><Download className="w-3.5 h-3.5" /></Button></a>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => delAttachment.mutate(a.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
              <ImageUpload label="" value="" accept="*/*" onChange={(url) => url && addAttachment.mutate({ filename: url.split("/").pop(), url, size: 0 })} />
            </div>

            {/* Timeline */}
            <div className="mt-6">
              <Label className="flex items-center gap-1"><Clock className="w-4 h-4" /> Activity Timeline</Label>
              <div className="mt-2 space-y-3 border-l-2 border-vm-accent/30 pl-4">
                {[...(t.activity || [])].reverse().map((a) => (
                  <div key={a.id} className="relative">
                    <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-vm-accent" />
                    <p className="text-sm text-vm-ink">{a.message || a.action}</p>
                    <p className="text-xs text-slate-400">{a.user} · {new Date(a.at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
