import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, PriorityBadge } from "@/components/admin/support/TicketBadges";
import TicketDetailSheet from "@/components/admin/support/TicketDetailSheet";
import { TICKET_STATUSES, PRIORITIES } from "@/lib/ticketConstants";
import { Loader2, Plus, Eye, Search } from "lucide-react";

export default function Tickets({ mine = false }) {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [status, setStatus] = useState(params.get("status") || "all");
  const [priority, setPriority] = useState("all");
  const [type, setType] = useState(params.get("type") || "all");
  const [q, setQ] = useState("");
  const [detailId, setDetailId] = useState(params.get("open") || null);

  const { data: config } = useQuery({ queryKey: ["ticket-config"], queryFn: async () => (await api.get("/tickets/config")).data });
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["tickets", status, priority, type, q, mine],
    queryFn: async () => (await api.get("/tickets", { params: {
      status: status !== "all" ? status : undefined, priority: priority !== "all" ? priority : undefined,
      type: type !== "all" ? type : undefined, q: q || undefined, mine: mine || undefined,
    } })).data,
  });

  useEffect(() => { if (params.get("open")) setDetailId(params.get("open")); }, [params]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div><h1 className="font-heading text-2xl font-bold text-vm-ink">{mine ? "My Tasks" : "Tickets"}</h1><p className="text-slate-500 text-sm">{mine ? "Tickets assigned to you" : "All customer tickets"}</p></div>
        <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => nav("/admin/support/create-ticket")} data-testid="new-ticket-btn"><Plus className="w-4 h-4 mr-2" /> Create Ticket</Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Search ticket, customer, phone..." value={q} onChange={(e) => setQ(e.target.value)} data-testid="ticket-search" /></div>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-40" data-testid="filter-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem>{TICKET_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
        <Select value={priority} onValueChange={setPriority}><SelectTrigger className="w-36"><SelectValue placeholder="Priority" /></SelectTrigger><SelectContent><SelectItem value="all">All Priority</SelectItem>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.value}</SelectItem>)}</SelectContent></Select>
        <Select value={type} onValueChange={setType}><SelectTrigger className="w-44"><SelectValue placeholder="Type" /></SelectTrigger><SelectContent><SelectItem value="all">All Types</SelectItem>{(config?.types || []).map((t) => <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}</SelectContent></Select>
      </div>

      <div className="border border-[#E2E8F0] rounded-lg overflow-x-auto bg-white">
        <Table>
          <TableHeader><TableRow className="bg-vm-bg"><TableHead>Ticket</TableHead><TableHead>Customer</TableHead><TableHead>Type</TableHead><TableHead>Assignee</TableHead><TableHead>Status</TableHead><TableHead>Priority</TableHead><TableHead>Due</TableHead><TableHead className="text-right">View</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={8} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></TableCell></TableRow>
              : (data?.items || []).length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-slate-400">No tickets found.</TableCell></TableRow>
              : data.items.map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => setDetailId(t.id)} data-testid={`ticket-row-${t.ticket_number}`}>
                  <TableCell className="font-medium text-vm-green">{t.ticket_number}</TableCell>
                  <TableCell><span className="text-vm-ink">{t.company_name}</span><br /><span className="text-xs text-slate-400">{t.customer_name}</span></TableCell>
                  <TableCell className="text-sm">{t.type}</TableCell>
                  <TableCell className="text-sm">{t.assignee_name}</TableCell>
                  <TableCell><StatusBadge status={t.effective_status} /></TableCell>
                  <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                  <TableCell className="text-sm text-slate-500">{t.due_date ? new Date(t.due_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="icon"><Eye className="w-4 h-4" /></Button></TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <TicketDetailSheet id={detailId} onClose={() => { setDetailId(null); if (params.get("open")) { params.delete("open"); setParams(params); } }} onChanged={refetch} />
    </div>
  );
}
