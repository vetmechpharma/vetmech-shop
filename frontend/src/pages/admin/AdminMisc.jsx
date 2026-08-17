import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ImageUpload from "@/components/admin/ImageUpload";
import { toast } from "sonner";
import { Loader2, Pencil, MessageCircle, Mail } from "lucide-react";

export function AdminEnquiries() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-enquiries"], queryFn: async () => (await api.get("/admin/enquiries")).data });
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-vm-ink mb-6">Contact Enquiries</h1>
      <div className="border border-[#E2E8F0] rounded-lg overflow-x-auto bg-white">
        <Table>
          <TableHeader><TableRow className="bg-vm-bg"><TableHead>Name</TableHead><TableHead>Mobile</TableHead><TableHead>Subject</TableHead><TableHead>Message</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></TableCell></TableRow>
              : (data || []).length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-10 text-slate-400">No enquiries yet.</TableCell></TableRow>
              : data.map((e) => (
                <TableRow key={e.id}><TableCell className="font-medium text-vm-ink">{e.name}<br /><span className="text-xs text-slate-400">{e.email}</span></TableCell><TableCell className="text-sm">{e.mobile}</TableCell><TableCell className="text-sm">{e.subject}</TableCell><TableCell className="text-sm max-w-xs truncate">{e.message}</TableCell><TableCell className="text-sm text-slate-500">{new Date(e.created_at).toLocaleDateString()}</TableCell></TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function AdminApplications() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-applications"], queryFn: async () => (await api.get("/admin/applications")).data });
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-vm-ink mb-6">Career Applications</h1>
      <div className="border border-[#E2E8F0] rounded-lg overflow-x-auto bg-white">
        <Table>
          <TableHeader><TableRow className="bg-vm-bg"><TableHead>Name</TableHead><TableHead>Job</TableHead><TableHead>Mobile</TableHead><TableHead>Qualification</TableHead><TableHead>Resume</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></TableCell></TableRow>
              : (data || []).length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-10 text-slate-400">No applications yet.</TableCell></TableRow>
              : data.map((a) => (
                <TableRow key={a.id}><TableCell className="font-medium text-vm-ink">{a.name}</TableCell><TableCell className="text-sm">{a.job_title}</TableCell><TableCell className="text-sm">{a.mobile}</TableCell><TableCell className="text-sm">{a.qualification}</TableCell><TableCell>{a.resume_url ? <a href={a.resume_url} target="_blank" rel="noreferrer" className="text-vm-green underline text-sm">View</a> : "—"}</TableCell></TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function AdminNotifications() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-notifications"], queryFn: async () => (await api.get("/admin/notifications", { params: { limit: 100 } })).data });
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-vm-ink mb-2">Notification Log</h1>
      <p className="text-slate-500 text-sm mb-6">All WhatsApp & Email messages (simulated in demo mode)</p>
      <div className="space-y-2">
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          : (data?.items || []).map((n) => (
            <div key={n.id} className="border border-[#E2E8F0] rounded-lg p-3 bg-white flex gap-3">
              <div className={`w-9 h-9 rounded-md grid place-items-center flex-shrink-0 ${n.channel === "whatsapp" ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600"}`}>{n.channel === "whatsapp" ? <MessageCircle className="w-4 h-4" /> : <Mail className="w-4 h-4" />}</div>
              <div className="flex-1 min-w-0"><div className="flex justify-between"><span className="text-sm font-medium text-vm-ink">To: {n.to}</span><span className="text-xs text-slate-400">{new Date(n.created_at).toLocaleString()}</span></div>{n.subject && <p className="text-xs font-medium">{n.subject}</p>}<p className="text-sm text-slate-600 whitespace-pre-line">{n.message}</p>{n.simulated && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">SIMULATED</span>}</div>
            </div>
          ))}
        {data?.items?.length === 0 && <p className="text-slate-400 text-center py-10">No notifications yet.</p>}
      </div>
    </div>
  );
}

export function AdminAuditLogs() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-audit"], queryFn: async () => (await api.get("/admin/audit-logs", { params: { limit: 100 } })).data });
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-vm-ink mb-6">Audit Logs</h1>
      <div className="border border-[#E2E8F0] rounded-lg overflow-x-auto bg-white">
        <Table>
          <TableHeader><TableRow className="bg-vm-bg"><TableHead>Time</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={4} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></TableCell></TableRow>
              : (data?.items || []).map((l) => (
                <TableRow key={l.id}><TableCell className="text-sm text-slate-500">{new Date(l.created_at).toLocaleString()}</TableCell><TableCell className="text-sm">{l.actor_name}</TableCell><TableCell className="text-sm font-medium text-vm-ink">{l.action}</TableCell><TableCell className="text-sm">{l.entity} {l.meta?.name ? `· ${l.meta.name}` : ""}</TableCell></TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function AdminReports() {
  const { data } = useQuery({ queryKey: ["admin-reports"], queryFn: async () => (await api.get("/admin/reports/summary")).data });
  if (!data) return <div className="text-slate-400">Loading...</div>;
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-vm-ink mb-6">Reports</h1>
      <div className="grid grid-cols-2 gap-4 max-w-lg mb-8">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5"><p className="text-2xl font-heading font-bold text-vm-ink">{data.total_orders}</p><p className="text-sm text-slate-500">Total Orders</p></div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5"><p className="text-2xl font-heading font-bold text-vm-green">₹{(data.total_value || 0).toLocaleString("en-IN")}</p><p className="text-sm text-slate-500">Sales Value (internal)</p></div>
      </div>
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 max-w-lg">
        <h3 className="font-heading font-bold text-vm-ink mb-3">Most Reordered Products</h3>
        {data.most_reordered?.map((p, i) => <div key={i} className="flex justify-between text-sm border-b border-slate-50 py-1.5"><span className="text-slate-600">{p.name}</span><span className="font-medium">{p.count}×</span></div>)}
      </div>
    </div>
  );
}

export function AdminPages() {
  const qc = useQueryClient();
  const { data: pages, isLoading } = useQuery({ queryKey: ["admin-pages"], queryFn: async () => (await api.get("/admin/pages")).data });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (editing) setForm(editing); }, [editing]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    setSaving(true);
    try { await api.put(`/admin/pages/${form.slug}`, form); toast.success("Page saved"); qc.invalidateQueries({ queryKey: ["admin-pages"] }); setEditing(null); }
    catch (e) { toast.error(apiError(e)); }
    setSaving(false);
  };
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-vm-ink mb-6">Website Pages</h1>
      <div className="border border-[#E2E8F0] rounded-lg overflow-x-auto bg-white">
        <Table>
          <TableHeader><TableRow className="bg-vm-bg"><TableHead>Title</TableHead><TableHead>Slug</TableHead><TableHead className="text-right">Edit</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={3} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></TableCell></TableRow>
              : (pages || []).map((p) => (
                <TableRow key={p.slug}><TableCell className="font-medium text-vm-ink">{p.title}</TableCell><TableCell className="text-sm">/{p.slug}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => setEditing(p)}><Pencil className="w-4 h-4" /></Button></TableCell></TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">Edit Page: {form.title}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={form.title || ""} onChange={(e) => set("title", e.target.value)} /></div>
            <div><Label>Subtitle</Label><Input value={form.subtitle || ""} onChange={(e) => set("subtitle", e.target.value)} /></div>
            <ImageUpload label="Banner Image" value={form.banner} onChange={(v) => set("banner", v)} />
            <div><Label>Content</Label><Textarea rows={10} value={form.content || ""} onChange={(e) => set("content", e.target.value)} /></div>
            <div><Label>SEO Title</Label><Input value={form.seo?.title || ""} onChange={(e) => set("seo", { ...form.seo, title: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button className="bg-vm-green hover:bg-vm-greenhover" onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
